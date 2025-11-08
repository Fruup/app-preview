interface Config {
  publicUrl: string | null;
  githubApp: {
    id: number;
    name: string;
    pem: string;
    clientId: string;
    clientSecret: string;
    webhookSecret: string | null;
  } | null;
  onePassword: { serviceToken: string } | null;
  repositories: {
    [fullName: string]:
      | {
          enablePreview: boolean;
          targetBranch: string;
        }
      | undefined;
  };
}

const _empty: Config = {
  publicUrl: null,
  githubApp: null,
  onePassword: null,
  repositories: {},
};

export async function loadConfig(): Promise<Config> {
  const file = Bun.file("app-preview.config.json");
  if (!(await file.exists())) return _empty;

  const loaded = await file.json().catch((e) => {
    console.error(e);
    return _empty;
  });

  return loaded;
}

export async function storeConfig(config: Config) {
  // TODO: This contains sensitive information
  await Bun.write("app-preview.config.json", JSON.stringify(config, null, 2));
}

export async function updateConfig(
  updater: ((current: Config) => Config) | Partial<Config>
) {
  const current = await loadConfig();

  let updated: Config;
  if (typeof updater === "function") {
    updated = updater(current);
  } else {
    updated = { ...current, ...updater };
  }

  await storeConfig(updated);
}
