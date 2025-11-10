import type { App } from "@octokit/app";
import { loadConfig, storeConfig, updateConfig } from "../config";
import { createAppAuth } from "@octokit/auth-app";

export const getPublicIp = async (): Promise<string | null> => {
  try {
    const res = await fetch("https://api.ipify.org?format=text");
    if (!res.ok) throw new Error("Failed to fetch public IP");
    const ip = await res.text();
    return ip;
  } catch {
    return null;
  }
};

// Converts an arbitrary string to a FQDN
export const toDomainNamePart = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replaceAll(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

export const getGithubToken = async (): Promise<string | null> => {
  const config = await loadConfig();
  if (!config.githubApp) return null;

  if (config.githubApp.token) {
    const expiresAt = new Date(config.githubApp.token.expiresAt);
    if (expiresAt > new Date()) {
      return config.githubApp.token.token;
    }
  }

  const newToken = await createAppAuth({
    appId: config.githubApp.id,
    privateKey: config.githubApp.pem,
    installationId: config.githubApp.installationId,
  })({ type: "installation" });

  config.githubApp.token = {
    token: newToken.token,
    expiresAt: newToken.expiresAt,
  };

  await storeConfig(config);

  return newToken.token;
};

export function buildEnvString(
  /** Everything value that's not a string will be filtered out */
  envs: {
    [key: string]: string | undefined | null | false;
  }
): string {
  return Object.entries(envs)
    .filter(
      (e): e is [string, string] =>
        e[1] !== undefined && e[1] !== null && e[1] !== false
    )
    .map(([key, value]) => `${key}=${value.replaceAll('"', '\\"')}`)
    .join("\n");
}
