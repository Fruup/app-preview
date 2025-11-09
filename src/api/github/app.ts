import { App } from "@octokit/app";
import { loadConfig } from "../../config";

let _app: App | undefined;

export async function getGitHubApp() {
  if (_app) return _app;

  const config = await loadConfig();

  if (!config.githubApp) return null;

  const app = new App({
    appId: config.githubApp.id,
    privateKey: config.githubApp.pem,
    oauth: {
      clientId: config.githubApp.clientId,
      clientSecret: config.githubApp.clientSecret,
    },
    webhooks: {
      secret: config.githubApp.webhookSecret || "",
    },
  });

  _app = app;
  return _app;
}
