import { getPublicIp } from "../utils";
import { loadConfig } from "../config";
import * as prompts from "@clack/prompts";
import * as colors from "nanocolors";
import { App } from "@octokit/app";

export async function setup() {
  prompts.intro("Setting up App Preview");

  const config = await loadConfig();

  {
    const answer = await prompts.text({
      message: "Public URL for your app (leave empty to use public IP):",
      initialValue: config.publicUrl || "",
      validate(value) {
        if (!URL.parse(value)) {
          return "Please enter a valid URL";
        }
      },
    });

    if (prompts.isCancel(answer)) process.exit(1);

    if (answer.length > 0) {
      config.publicUrl = answer;
    }
  }

  if (config.githubApp) {
    const answer = await prompts.confirm({
      message:
        "GitHub App is already configured. Do you want to reconfigure it?",
      initialValue: false,
    });

    if (prompts.isCancel(answer)) process.exit(1);
    if (answer) await configureGithubIntegration();
  } else {
    await configureGithubIntegration();
  }

  prompts.outro("All done! Setup complete.");
}

export async function configureGithubIntegration() {
  const config = await loadConfig();
  const appUrl = config.publicUrl ?? `http://${await getPublicIp()}`;
  const url = `${appUrl}/api/v1/github/connection/start`;

  prompts.log.message(
    `Opening browser to create GitHub App...\n\n` +
      `If your browser does not open automatically, please visit:\n` +
      `${colors.bold(colors.underline(colors.dim(url)))}`
  );

  await Bun.sleep(2000);

  try {
    const { default: open } = await import("open");
    await open(url);
  } catch {}

  const answer = await prompts.confirm({
    message: "Do you want to check the GitHub integration now?",
  });

  if (prompts.isCancel(answer)) process.exit(1);
  if (answer) await checkGithubIntegration();
}

export async function checkGithubIntegration() {
  const config = await loadConfig();

  if (!config.githubApp) {
    prompts.log.error(
      "GitHub App is not configured yet. Please complete the setup process."
    );
    return;
  }

  const { status } = await new App({
    appId: config.githubApp.id,
    privateKey: config.githubApp.pem,
  }).octokit.request("GET /app");

  if (status === 200) {
    prompts.log.success("GitHub App is configured correctly!");
  } else {
    prompts.log.error("Failed to verify GitHub App configuration.");
  }
}
