import type {
  OnePasswordEnvGenerator as OnePasswordEnvGenerator_,
  EnvGenerator,
} from "./src/env";
import type { ProjectConfig } from "./src/project";

declare global {
  declare function defineConfig(
    getter: (ctx: {
      appName: string;
      /**
       * The domain-safe version of the app name.
       *
       * Example: `appName` = "My App" => `appNameDomainInfix` = "my-app"
       */
      appNameDomainInfix: string;
      OnePasswordEnvGenerator: typeof OnePasswordEnvGenerator_;
    }) => MaybePromise<ProjectConfig>
  ): Promise<ProjectConfig>;
}

type MaybePromise<T> = T | Promise<T>;
