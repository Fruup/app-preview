import { existsSync } from "fs";
import { exec } from "./lib";
import { dockerComposeSchema } from "./schemas/compose";
import path from "path";
import type { EnvGenerator } from "../src/env";
import { OnePasswordEnvGenerator } from "../src/env";
import type { ContainerStatus } from "./types";
import { toDomainNamePart } from "./utils";

export interface ProjectOptions {
  appName: string;
  source: ProjectSource;
}

export interface ProjectConfig {
  /** Relative to the project's directory */
  root?: string;
  dockerComposePath?: string;
  envGenerator?: EnvGenerator;
  expose?: {
    /** Maps a service (same as in the compose file) to its domain */
    [serviceKey: string]: {
      domain?: string;
      /**
       * Basic auth string(s) in the format "user:hashed_password".
       * Use the following command to generate a bcrypt hash:
       *
       *   htpasswd -nbB <user> <password>
       */
      basicAuth?: string | string[];
    };
  };
}

export class Project {
  #isInitialized = false;
  #options: ProjectOptions & ProjectConfig;

  constructor(options: ProjectOptions & ProjectConfig) {
    this.#options = options;
  }

  get options() {
    return this.#options;
  }

  async initialize() {
    if (this.#isInitialized) return;

    await this._cleanup();

    if (this.options.source.type === "git") {
      await this._cloneOrPull({
        repo: this.options.source.repo,
        branch: this.options.source.branch,
      });
    } else if (this.options.source.type === "local") {
      await this._copyLocal({ sourcePath: this.options.source.path });
    } else {
      throw new Error("Unknown project source type");
    }

    // Load the config
    try {
      const configFilePath = await new Bun.Glob("**/app-preview.config.ts")
        .scan({
          cwd: this.paths.projectDirectory,
          onlyFiles: true,
        })
        .next()
        .then(({ value }) => {
          const relativePath: string | undefined = value;
          return relativePath
            ? path.join(this.paths.projectDirectory, relativePath)
            : undefined;
        });

      if (!configFilePath || !(await Bun.file(configFilePath).exists())) {
        throw new Error("No app-preview.config.ts found");
      }

      const defineConfigSymbol = Symbol("defineConfig");

      global.defineConfig = async (getter): Promise<ProjectConfig> => {
        const result = getter({
          appName: this.options.appName,
          appNameDomainInfix: toDomainNamePart(this.options.appName),
          OnePasswordEnvGenerator,
        });

        const config = Object.fromEntries(
          await Promise.all(
            Object.entries(result).map(async ([k, v]) => [k, await v])
          )
        );

        config[defineConfigSymbol] = true;

        return config;
      };

      // TODO: make more flexible
      const config = await import(configFilePath).then(async (exports) => {
        await Bun.sleep(100);
        const maybeConfig = await exports.default;
        await Bun.sleep(100);

        if (!maybeConfig || !maybeConfig[defineConfigSymbol]) {
          console.error("maybeConfig", maybeConfig);

          throw new Error(
            "app-preview.config.ts must export the result of `defineConfig` as default (`export default defineConfig(...)`)"
          );
        }

        return await (maybeConfig as ReturnType<typeof defineConfig>);
      });

      // TODO: ugly
      this.#options = {
        ...this.#options,
        ...config,
      };
    } catch (e) {
      console.error("Error loading config file:", e);
      throw new Error("Failed to load project config");
    }

    return this;
  }

  /** Unfinished */
  static async load(appName: string) {
    const file = Bun.file(
      path.join(PATHS.apps, ".stored", appName, "project.json")
    );
    if (!(await file.exists())) throw new Error("No project file found");

    return new Project(await file.json());
  }

  /** Unfinished */
  async store() {
    const json = JSON.stringify(this, null, 2);
    await Bun.write(
      path.join(PATHS.apps, ".stored", this.options.appName, "project.json"),
      json
    );
  }

  async status(): Promise<ContainerStatus[] | null> {
    const statusProcess = await this.compose(["ps", "--format", "json"]);
    if (!statusProcess) {
      console.warn("No status process found");
      return null;
    }

    const result = statusProcess.stdout
      .toString()
      .split("\n")
      .filter(Boolean)
      .map((x) => JSON.parse(x) as ContainerStatus);

    if (!result.length) return null;
    return result;
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
      get dockerCompose() {
        return self.options.dockerComposePath ?? "docker-compose.yml";
      },
    };
  }

  async compose(
    cmds: string[],
    options: {
      noEnvFile?: boolean;
      noFailEarly?: boolean;
    } = {}
  ) {
    const composeFile = path.join(this.paths.temp, "docker-compose.yml");
    const composeFileExists = await Bun.file(composeFile).exists();
    if (!composeFileExists) return;

    const envFile = path.join(this.paths.temp, ".env");
    const envFileExists = await Bun.file(envFile).exists();

    return await exec(
      [
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
      ],
      {},
      { noFailEarly: options.noFailEarly }
    );
  }

  async up() {
    await this.initialize();

    const envFilePath = path.join(this.paths.temp, ".env");

    const filePath = path.join(this.paths.root, this.paths.dockerCompose);
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

    await exec(
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

    await exec(
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
      const routerName = `${this.options.appName}_${name}`;

      // Add env file
      service.env_file ??= [];
      if (typeof service.env_file === "string")
        service.env_file = [service.env_file];
      service.env_file.push(envFilePath);

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
      service.labels.push(`traefik.port=80`); // TODO:

      // Add domain labels
      const exposeConfig = this.options.expose?.[name];
      const domain = exposeConfig?.domain;

      if (domain) {
        // TODO: https
        service.labels.push(`traefik.enable=true`);
        service.labels.push(
          `traefik.http.routers.${routerName}.rule=Host(\`${domain}\`)`
        );
        service.labels.push(
          `traefik.http.routers.${routerName}.entrypoints=web`
        );
      }

      // Add basic auth labels
      const basicAuth = exposeConfig?.basicAuth;
      if (basicAuth) {
        const users = (typeof basicAuth === "string" ? [basicAuth] : basicAuth)
          .join(",")
          .replaceAll("$", "$$$$"); // Escape $ for docker compose (no idea why 4 are needed)

        service.labels.push(
          `traefik.http.middlewares.${name}-auth.basicAuth.users=${users}`
        );
        service.labels.push(
          `traefik.http.routers.${name}.middlewares=${name}-auth`
        );
      }

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
    await Bun.write(
      path.join(this.paths.temp, "docker-compose.yml"),
      newConfigYaml
    );

    // Process .env
    let existingEnvContent = "";
    if (this.options.envGenerator) {
      existingEnvContent = await this.options.envGenerator.generate();
    } else {
      const envFilePath = path.join(this.paths.root, ".env");
      const envFile = Bun.file(envFilePath);

      if (await envFile.exists()) existingEnvContent = await envFile.text();
      else console.warn(`No .env file found at ${envFilePath}`);
    }

    const envContent =
      `# ---------- ADDED ----------\n\n` +
      `APP_NAME="${this.options.appName.replaceAll('"', '\\"')}"\n` +
      `APP_NAME_DOMAIN_INFIX="${toDomainNamePart(this.options.appName)}"\n` +
      `\n` +
      `# ---------- ORIGINAL ----------\n\n` +
      existingEnvContent;

    await Bun.write(envFilePath, envContent);

    // Start the stack
    this.compose(["up", "--force-recreate", "--build", "-d", "--wait"]);
  }

  async down() {
    return this._cleanup();
  }

  private async _cleanup() {
    // Compose down
    await this.compose(["down", "--volumes", "--remove-orphans"], {
      noFailEarly: true,
    });

    // Clean up temp directory
    await exec(["rm", "-rf", this.paths.temp]);
  }

  private async _cloneOrPull({
    repo,
    branch,
  }: {
    repo: string;
    branch: string;
  }) {
    if (existsSync(path.join(this.paths.projectDirectory, ".git"))) {
      await exec(["git", "pull", "origin", branch], {
        cwd: this.paths.projectDirectory,
      });
    } else {
      await exec(["mkdir", "-p", this.paths.projectDirectory]);

      await exec([
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
    await exec(["rm", "-rf", this.paths.projectDirectory]);
    await exec(["mkdir", "-p", this.paths.projectDirectory]);
    await exec(["cp", "-R", sourcePath + "/.", this.paths.projectDirectory]);
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
