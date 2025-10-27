import { existsSync } from "fs";
import { exec, toDomainNamePart } from "./lib";
import { dockerComposeSchema } from "./schemas/compose";
import path from "path";

export interface ProjectOptions {
  appName: string;
  source: ProjectSource;
  /** Relative to the project's directory */
  root?: string;
}

export class Project {
  private constructor(public readonly options: ProjectOptions) {}

  static async create({
    appName,
    source,
    root,
  }: {
    appName: string;
    source: ProjectSource;
    root?: string;
  }) {
    const project = new Project({ appName, source, root });
    project._cleanup();

    if (source.type === "git") {
      await project._cloneOrPull({
        repo: source.repo,
        branch: source.branch,
      });
    } else if (source.type === "local") {
      await project._copyLocal({ sourcePath: source.path });
    } else {
      throw new Error("Unknown project source type");
    }

    return project;
  }

  static async load(appName: string) {
    const file = Bun.file(
      path.join(PATHS.apps, ".stored", appName, "project.json")
    );
    if (!(await file.exists())) throw new Error("No project file found");

    return new Project(await file.json());
  }

  async store() {
    const json = JSON.stringify(this, null, 2);
    await Bun.write(
      path.join(PATHS.apps, ".stored", this.options.appName, "project.json"),
      json
    );
  }

  get paths() {
    const self = this;

    return {
      get projectDirectory() {
        return path.join(PATHS.apps, self.options.appName);
      },
      get root() {
        return path.join(this.projectDirectory, self.options.root ?? ".");
      },
      get temp() {
        return path.join(this.root, ".app-preview");
      },
    };
  }

  async compose(
    cmds: string[],
    options: {
      noEnvFile?: boolean;
    } = {}
  ) {
    const composeFile = path.join(this.paths.temp, "docker-compose.yml");
    const composeFileExists = await Bun.file(composeFile).exists();
    if (!composeFileExists) return;

    const envFile = path.join(this.paths.temp, ".env");
    const envFileExists = await Bun.file(envFile).exists();

    return exec([
      "docker",
      "compose",
      !options.noEnvFile && envFileExists && ["--env-file", envFile],
      "--project-name",
      this.options.appName,
      "--project-directory",
      this.paths.root,
      "-f",
      composeFile,
      ...cmds,
    ]);
  }

  async up() {
    const filePath = path.join(this.paths.root, "docker-compose.yml");
    const file = Bun.file(filePath);
    if (!(await file.exists()))
      throw new Error(`No docker-compose.yml file found at "${filePath}"`);

    const composeConfig = dockerComposeSchema.parse(
      Bun.YAML.parse(await file.text())
    );

    // Set project name
    composeConfig.name = this.options.appName;

    // Create local network for this stack and attach it to traefik
    const networkName = `${this.options.appName}_default`;

    exec(
      ["docker", "network", "create", networkName],
      {},
      {
        onError({ stderr, preventFailEarly }) {
          if (
            stderr.includes(`network with name ${networkName} already exists`)
          ) {
            preventFailEarly();
          }
        },
      }
    );

    exec(
      ["docker", "network", "connect", networkName, traefikContainerName],
      {},
      {
        onError({ stderr, preventFailEarly }) {
          if (
            stderr.includes(
              `endpoint with name ${traefikContainerName} already exists in network ${networkName}`
            )
          ) {
            preventFailEarly();
          }
        },
      }
    );

    composeConfig.networks ??= {};
    composeConfig.networks[networkName] = {
      external: true,
    };

    for (const [name, service] of Object.entries(composeConfig.services)) {
      // Namespace container names
      if (service.container_name) {
        service.container_name = `${this.options.appName}_${service.container_name}`;
      } else {
        service.container_name = `${this.options.appName}_${name}`;
      }

      // Add networks
      service.networks ??= [];
      if (Array.isArray(service.networks)) {
        service.networks.push(networkName);
      } else {
        service.networks[networkName] = null;
      }

      // Add labels
      service.labels ??= [];
      service.labels.push(`traefik.docker.network=${networkName}`);

      // Create dynamic mounts
      for (const volume of service.volumes ?? []) {
        if (typeof volume === "string") continue;
        if (volume.type !== "bind") continue;
        if (!volume.target) continue;
        if (!volume.content) continue;

        const basename = path.basename(volume.target);
        volume.source = path.join(this.paths.temp, "dynamic-volumes", basename);

        await Bun.write(volume.source, volume.content);

        delete volume.content;
      }
    }

    const newConfigYaml = Bun.YAML.stringify(composeConfig, null, 2);

    // Write processed file
    console.log(newConfigYaml);
    await Bun.write(
      path.join(this.paths.temp, "docker-compose.yml"),
      newConfigYaml
    );

    // Process .env
    let existingEnvContent = "";
    const envFile = Bun.file(path.join(this.paths.root, ".env"));
    if (await envFile.exists()) existingEnvContent = await envFile.text();

    const envContent =
      `# ---------- ADDED ----------\n\n` +
      `APP_NAME="${this.options.appName.replaceAll('"', '\\"')}"\n` +
      `APP_NAME_FQDN="${toDomainNamePart(this.options.appName)}"\n` +
      `\n` +
      `# ---------- ORIGINAL ----------\n\n` +
      existingEnvContent;

    await Bun.write(path.join(this.paths.temp, ".env"), envContent);

    // Start the stack
    this.compose(["up", "--force-recreate", "--build", "-d"]);
  }

  down() {
    this._cleanup();
  }

  private _cleanup() {
    // Compose down
    this.compose(["down", "--volumes", "--remove-orphans"]);

    // Clean up temp directory
    exec(["rm", "-rf", this.paths.temp]);
  }

  private async _cloneOrPull({
    repo,
    branch,
  }: {
    repo: string;
    branch: string;
  }) {
    if (existsSync(path.join(this.paths.projectDirectory, ".git"))) {
      exec(["git", "pull", "origin", branch], {
        cwd: this.paths.projectDirectory,
      });
    } else {
      exec(["mkdir", "-p", this.paths.projectDirectory]);

      exec([
        "git",
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--branch",
        branch,
        repo,
        this.paths.projectDirectory,
      ]);
    }
  }

  private async _copyLocal({ sourcePath }: { sourcePath: string }) {
    exec(["rm", "-rf", this.paths.root]);
    exec(["mkdir", "-p", this.paths.root]);
    exec(["cp", "-R", sourcePath + "/", this.paths.root]);
  }
}

const traefikContainerName = "app-preview-traefik";

const PATHS = {
  get apps() {
    return path.join(process.cwd(), "apps");
  },
};

export type ProjectSource =
  | {
      type: "git";
      repo: string;
      branch: string;
    }
  | {
      type: "local";
      path: string;
    };
