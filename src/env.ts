import { createClient } from "@1password/sdk";
import pkg from "../package.json";
import { loadConfig } from "./config";

export abstract class EnvGenerator {
  abstract generate(): Promise<string>;
}

export class OnePasswordEnvGenerator extends EnvGenerator {
  static async create(itemUri: string) {
    const config = await loadConfig();

    if (!config.onePassword?.serviceToken) {
      throw new Error(
        "OnePasswordEnvGenerator requires a One Password service token to be set in the config."
      );
    }

    return new OnePasswordEnvGenerator({
      itemUri,
      token: config.onePassword.serviceToken,
    });
  }

  private constructor(
    private readonly options: {
      itemUri: string;
      token: string;
    }
  ) {
    super();
  }

  async generate() {
    const client = await createClient({
      auth: this.options.token,
      integrationName: pkg.name,
      integrationVersion: pkg.version,
    });

    let env = await client.secrets.resolve(this.options.itemUri);

    // Perform filtering to ensure a (more or less) valid ENV file
    env = env
      .split("\n")
      .filter((line) => !line || /^[A-Z#\s]/.test(line))
      .join("\n");

    return env;
  }
}
