import { exec, toDomainNamePart } from "./lib";
import { dockerComposeSchema } from "./schemas/compose";
import path from "path";

export class Project {
  #cwd: string;

  private constructor(
    public readonly appName: string,
    public readonly source: ProjectSource
  ) {
    this.#cwd = path.join(PATHS.apps, appName);
  }

  static async create(appName: string, source: ProjectSource) {
    const project = new Project(appName, source);
    project._cleanup();

    if (source.type === "git") {
      await project._clone({
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

  get paths() {
    const self = this;

    return {
      get root() {
        return self.#cwd;
      },
      get temp() {
        return path.join(self.#cwd, ".app-preview");
      },
    };
  }

  compose(
    cmds: string[],
    options: {
      noEnvFile?: boolean;
    } = {}
  ) {
    return exec([
      "docker",
      "compose",
      !options.noEnvFile && ["--env-file", path.join(this.paths.temp, ".env")],
      "--project-name",
      this.appName,
      "--project-directory",
      this.paths.root,
      "-f",
      path.join(this.paths.temp, "docker-compose.yml"),
      ...cmds,
    ]);
  }

  async up() {
    const file = Bun.file(path.join(this.paths.root, "docker-compose.yml"));
    if (!(await file.exists()))
      throw new Error("No docker-compose.yml file found");

    const composeConfig = dockerComposeSchema.parse(
      Bun.YAML.parse(await file.text())
    );

    // Set project name
    composeConfig.name = this.appName;

    // Create local network for this stack and attach it to traefik
    const networkName = `${this.appName}_default`;

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

    // console.log(Object.entries(composeConfig.services));
    for (const [name, service] of Object.entries(composeConfig.services)) {
      // Namespace container names
      if (service.container_name) {
        service.container_name = `${this.appName}_${service.container_name}`;
      } else {
        service.container_name = `${this.appName}_${name}`;
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

        console.log("DYNAMIC VOLUME", volume);

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
      `APP_NAME="${this.appName.replaceAll('"', '\\"')}"\n` +
      `APP_NAME_FQDN="${toDomainNamePart(this.appName)}"\n` +
      `\n` +
      `# ---------- ORIGINAL ----------\n\n` +
      existingEnvContent;

    await Bun.write(path.join(this.paths.temp, ".env"), envContent);

    // Start the stack
    this.compose(["up", "--force-recreate", "--build", "-d"]);
  }

  private _cleanup() {
    // Compose down
    this.compose(["down", "--volumes", "--remove-orphans"]);

    // Clean up temp directory
    exec(["rm", "-rf", this.paths.temp]);
  }

  private async _clone({ repo, branch }: { repo: string; branch: string }) {
    // exec(["rm", "-rf", targetDirectory]);

    if (await Bun.file(path.join(this.paths.root, ".git")).exists()) {
      exec(["git", "pull", "origin", branch], {
        cwd: this.#cwd,
      });
    } else {
      exec(
        [
          "git",
          "clone",
          "--depth",
          "1",
          "--single-branch",
          "--branch",
          branch,
          repo,
          this.paths.root,
        ],
        {
          cwd: this.#cwd,
        }
      );
    }
  }

  private async _copyLocal({ sourcePath }: { sourcePath: string }) {
    exec(["rm", "-rf", this.paths.root]);
    exec(["cp", "-R", sourcePath + "/", this.paths.root]);
  }
}

const traefikContainerName = "app-preview-traefik";

const PATHS = {
  get apps() {
    return path.join(process.cwd(), "apps");
  },
};

type ProjectSource =
  | {
      type: "git";
      repo: string;
      branch: string;
    }
  | {
      type: "local";
      path: string;
    };
