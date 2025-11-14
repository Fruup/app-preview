import simpleGit, { type CloneOptions } from "simple-git";
import * as colors from "nanocolors";
import * as prompts from "@clack/prompts";
import { exec } from "./lib";
import { dockerComposeSchema } from "./schemas/compose";
import path from "path";
import type { EnvGenerator } from "../src/env";
import { EnvVars, OnePasswordEnvGenerator } from "../src/env";
import type { ContainerStatus } from "./types";
import { getGithubToken, toDomainNamePart, tryCatch } from "./utils";

export interface ProjectOptions {
  appName: string;
  source: ProjectSource;
}

export interface ProjectConfig {
  /** Relative to the project's directory */
  root?: string;
  dockerComposePath?: string;
  envGenerator?: EnvGenerator | EnvGenerator[];
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
  #git = simpleGit();

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
      await this._clone({
        repoUrl: this.options.source.repoUrl,
        branch: this.options.source.branch,
      });
    } else if (this.options.source.type === "local") {
      await this._copyLocal({ sourcePath: this.options.source.path });
    } else {
      throw new Error("Unknown project source type");
    }

    // Load the config
    try {
      const configFile = await this._findFile("**/app-preview.config.ts");
      if (!configFile) throw new Error("No app-preview.config.ts found");

      global.defineConfig = async (getter): Promise<ProjectConfig> => {
        const config: any = await getter({
          appName: this.options.appName,
          appNameDomainInfix: toDomainNamePart(this.options.appName),
          // pullRequest: {
          //   number,
          //   branch,
          // },
          OnePasswordEnvGenerator,
        });

        config._defineConfigSymbol = true;

        return config;
      };

      const exports = await import(configFile.filepath);
      const maybeConfig = await exports.default;

      if (!maybeConfig || !maybeConfig._defineConfigSymbol) {
        console.error("maybeConfig", maybeConfig);

        throw new Error(
          "app-preview.config.ts must export the result of `defineConfig` as default (`export default defineConfig(...)`)"
        );
      }

      const config = await (maybeConfig as ReturnType<typeof defineConfig>);

      // TODO: ugly
      this.#options = {
        ...this.#options,
        ...config,
      };

      console.debug("LOADED CONFIG:", this.#options);
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
    const composeFile = await this._findFile(
      "**/.app-preview/docker-compose.yml"
    );

    if (!composeFile) {
      console.warn(`No docker-compose.yml found at ${composeFile}`);
      return;
    }

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
        composeFile.filepath,
        ...cmds,
      ],
      {},
      { noFailEarly: options.noFailEarly }
    );
  }

  async up() {
    if (!this.#isInitialized) {
      throw new Error(
        "Project not initialized. Please call initialize() first."
      );
    }

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
      { expectedErrors: [`network with name ${networkName} already exists`] }
    );

    await exec(
      ["docker", "network", "connect", networkName, traefikContainerName],
      {},
      {
        expectedErrors: [
          `endpoint with name ${traefikContainerName} already exists in network ${networkName}`,
        ],
      }
    );

    composeConfig.networks ??= {};
    composeConfig.networks[networkName] = {
      external: true,
    };

    const domains: string[] = [];

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

        domains.push(domain);
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
    let existingEnvs = new EnvVars({});

    if (this.options.envGenerator) {
      if (Array.isArray(this.options.envGenerator)) {
        existingEnvs = await Promise.all(
          this.options.envGenerator.map((gen) => gen.generate())
        ).then((results) =>
          results.reduce((acc, env) => acc.merge(env), new EnvVars({}))
        );
      } else {
        existingEnvs = await this.options.envGenerator.generate();
      }
    } else {
      const envFilePath = path.join(this.paths.root, ".env");
      const envFile = Bun.file(envFilePath);

      if (await envFile.exists())
        existingEnvs = EnvVars.parse(await envFile.text());
      else console.warn(`No .env file found at ${envFilePath}`);
    }

    const commitSha = await this.#git
      .revparse(["HEAD"])
      .then((result) => result.trim())
      .catch((error) => {
        console.error("Error getting commit SHA:", error);
        return null;
      });

    const addedEnvs = new EnvVars({
      APP_NAME: this.options.appName,
      APP_NAME_DOMAIN_INFIX: toDomainNamePart(this.options.appName),
      COMMIT_SHA: commitSha,
    });

    const envContent =
      `# ---------- ADDED ----------\n\n` +
      addedEnvs.stringify() +
      "\n\n" +
      `# ---------- ORIGINAL ----------\n\n` +
      existingEnvs.stringify();

    await Bun.write(envFilePath, envContent);

    // Start the stack
    await this.compose(["up", "--force-recreate", "--build", "-d", "--wait"]);

    prompts.note(
      `${colors.green("Domains")}:\n` +
        domains
          .map((domain) => ` - ${colors.underline("http://" + domain)}`)
          .join("\n"),
      `Project "${this.options.appName}" is up 🚀`
    );
  }

  async down() {
    await this._cleanup();

    prompts.note(`Project "${this.options.appName}" down`);
  }

  private async _cleanup() {
    // Compose down
    await this.compose(["down", "--volumes", "--remove-orphans"], {
      noFailEarly: true,
    });

    // Remove files
    await exec(["rm", "-rf", this.paths.projectDirectory]).catch(() => {});
  }

  private async _clone({
    repoUrl,
    branch,
  }: {
    repoUrl: string;
    branch: string;
  }) {
    const spinner = prompts.spinner();
    spinner.start(`Cloning repository ${colors.dim(repoUrl)}...`);

    const { error } = await tryCatch(async () => {
      await exec(["mkdir", "-p", this.paths.projectDirectory]);

      const token = await getGithubToken();
      if (!token) throw new Error("Failed to get GitHub token");

      repoUrl = repoUrl.replace("https://", "").replace("http://", "");

      await this.#git.clone(
        `https://x-access-token:${token}@${repoUrl}`,
        this.paths.projectDirectory,
        {
          "--depth": 1,
          "--single-branch": null,
          "--branch": branch,
        } satisfies CloneOptions
      );
    });

    if (error) spinner.stop(error?.toString(), 1);
    else spinner.stop(`Repository ${colors.dim(repoUrl)} cloned.`);

    // Set git working directory
    this.#git.cwd({ path: this.paths.projectDirectory, root: true });
  }

  private async _copyLocal({ sourcePath }: { sourcePath: string }) {
    await exec(["rm", "-rf", this.paths.projectDirectory]);
    await exec(["mkdir", "-p", this.paths.projectDirectory]);
    await exec(["cp", "-R", sourcePath + "/.", this.paths.projectDirectory]);
  }

  private async _findFile(pattern: string) {
    const filepath = await new Bun.Glob(pattern)
      .scan({
        cwd: this.paths.projectDirectory,
        onlyFiles: true,
        absolute: true,
        dot: true,
      })
      .next()
      .then(({ value }) => value as string | undefined)
      .catch((e) => {
        if (e.code === "ENOENT") return undefined;

        console.error(e);
        return undefined;
      });

    if (!filepath) return null;

    const file = Bun.file(filepath);
    const exists = !!filepath && (await file.exists());
    if (!exists) return null;

    return { file, filepath };
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
      repoUrl: string;
      branch: string;
    }
  | {
      type: "local";
      path: string;
    };
