import { createClient } from "@1password/sdk";
import pkg from "../package.json";

export abstract class EnvGenerator {
  abstract generate(): Promise<string>;
}

export class OnePasswordEnvGenerator extends EnvGenerator {
  #clientPromise: ReturnType<typeof createClient>;

  constructor(
    private readonly options: {
      itemUri: string;
      accessToken: string;
    }
  ) {
    super();

    this.#clientPromise = createClient({
      auth: options.accessToken,
      integrationName: pkg.name,
      integrationVersion: pkg.version,
    });
  }

  async generate() {
    const client = await this.#clientPromise;

    let env = await client.secrets.resolve(this.options.itemUri);

    // Perform filtering to ensure a (more or less) valid ENV file
    env = env
      .split("\n")
      .filter((line) => !line || /^[A-Z#\s]/.test(line))
      .join("\n");

    return env;
  }
}
