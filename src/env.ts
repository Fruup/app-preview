import { createClient, type Client } from "@1password/sdk";
import pkg from "../package.json";
import { loadConfig } from "./config";
import { buildEnvString } from "./utils";

export abstract class EnvGenerator {
  abstract generate(): Promise<EnvVars>;
}

export class OnePasswordEnvGenerator extends EnvGenerator {
  static async create(itemUri: string) {
    const config = await loadConfig();

    if (!config.onePassword?.serviceToken) {
      throw new Error(
        "OnePasswordEnvGenerator requires a One Password service token to be set in the config."
      );
    }

    const token = config.onePassword.serviceToken;

    const client = await createClient({
      auth: token,
      integrationName: pkg.name,
      integrationVersion: pkg.version,
    });

    return new OnePasswordEnvGenerator(itemUri, client);
  }

  private constructor(
    private readonly itemUri: string,
    private readonly client: Client
  ) {
    super();
  }

  async generate() {
    const envString = await this.client.secrets.resolve(this.itemUri);
    return EnvVars.parse(envString);
  }
}

export class EnvVars {
  readonly envVars: Record<string, string>;

  constructor(_envVars: Record<string, string | null | undefined>) {
    this.envVars = Object.fromEntries(
      Object.entries(_envVars).flatMap<[string, string]>(([key, value]) =>
        typeof value === "string" ? [[key, value]] : []
      )
    );
  }

  stringify(): string {
    return buildEnvString(this.envVars);
  }

  merge(
    other: EnvVars,
    options: {
      /** @default "other" */
      prefer?: "self" | "other";
      /** @default false */
      overrideWithEmpty?: boolean;
    } = {}
  ): EnvVars {
    const { prefer = "other", overrideWithEmpty = false } = options;

    let first = prefer === "self" ? this : other;
    let second = prefer === "self" ? other : this;

    if (!overrideWithEmpty) {
      return new EnvVars({ ...first.envVars, ...second.envVars });
    }

    const keys = new Set<string>([
      ...Object.keys(first.envVars),
      ...Object.keys(second.envVars),
    ]);

    const result: Record<string, string> = {};

    for (const key of keys) {
      const firstValue = first.envVars[key];
      const secondValue = second.envVars[key];

      if (firstValue !== "" && firstValue !== undefined) {
        result[key] = firstValue;
      } else if (secondValue !== undefined) {
        result[key] = secondValue;
      }
    }

    return new EnvVars(result);
  }

  static parse(envString: string): EnvVars {
    const regex = /^([\w.-]+)=(.*)$/;

    return new EnvVars(
      Object.fromEntries(
        envString.split("\n").flatMap<[string, string]>((line) => {
          const match = line.match(regex);

          const key = match?.[1];
          let value = match?.[2];

          if (value?.startsWith('"') && value.endsWith('"')) {
            value = JSON.parse(value);
          } else if (value?.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
          }

          return key ? [[key, value ?? ""]] : [];
        })
      )
    );
  }
}
