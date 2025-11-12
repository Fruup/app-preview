import { getPublicIp } from "../utils";
import { loadConfig, storeConfig, updateConfig } from "../config";
import * as prompts from "@clack/prompts";
import * as colors from "nanocolors";
import { App } from "@octokit/app";
import { exec } from "../lib";

export async function setup() {
  prompts.intro("Setting up App Preview");

  const config = await loadConfig();

  {
    let answer = await prompts.text({
      message: "Public URL for your app (leave empty to use public IP):",
      initialValue: config.publicUrl || "",
      validate(value) {
        value = value?.trim();

        if (!value) return;

        if (!URL.parse(value)) {
          return "Please enter a valid URL";
        }
      },
    });

    if (prompts.isCancel(answer)) process.exit(1);

    answer = answer.trim();
    if (answer) {
      config.publicUrl = answer;
      await storeConfig(config);
    }
  }

  // Start API container
  {
    const publicUrl = config.publicUrl || `http://${await getPublicIp()}`;

    await exec(
      [
        "docker",
        "compose",
        "-f",
        "docker-compose.yml",
        "up",
        "api",
        "-d",
        "--force-recreate",
        "--wait",
      ],
      {
        env: {
          API_HOST: `${URL.parse(publicUrl)!.hostname}`,
          ...Bun.env,
        },
      }
    );
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

  {
    const answer = config.onePassword
      ? await prompts.confirm({
          message:
            "1Password integration is already configured. Do you want to reconfigure it?",
          initialValue: false,
        })
      : await prompts.confirm({
          message: "Do you want to set up the 1Password integration now?",
        });

    if (prompts.isCancel(answer)) process.exit(1);
    if (answer) await configureOnePasswordIntegration();
  }

  prompts.outro("All done! Setup complete.");
}

export async function configureGithubIntegration() {
  let config = await loadConfig();
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
    message: "Have you set up the GitHub App and completed the setup process?",
  });

  if (prompts.isCancel(answer)) process.exit(1);
  if (!answer) return configureGithubIntegration();

  // Reload config
  config = await loadConfig();

  if (!config.githubApp) {
    prompts.log.error(
      "GitHub App is not configured yet. Please complete the setup process."
    );
    return configureGithubIntegration();
  }

  const app = new App({
    appId: config.githubApp.id,
    privateKey: config.githubApp.pem,
  });

  const { data, status } = await app.octokit.request("GET /app");

  if (status !== 200 || !data) {
    prompts.log.error("Failed to verify GitHub App configuration.");
    return configureGithubIntegration();
  }

  if (data.installations_count !== 1) {
    prompts.log.error(
      `GitHub App must be installed on exactly one account. Currently installed on ${data.installations_count} accounts.`
    );
    return configureGithubIntegration();
  }

  let installationId: number | null = null;
  await app.eachInstallation(
    ({ installation }) => (installationId = installation.id)
  );

  if (!installationId) {
    prompts.log.error("Failed to retrieve GitHub App installation ID.");
    return configureGithubIntegration();
  }

  // Update config with installation ID
  config.githubApp.installationId = installationId;
  await storeConfig(config);

  prompts.log.success("GitHub App is configured correctly!");
}

export async function configureOnePasswordIntegration() {
  prompts.log.message(
    `You'll need to specify a service account token.\n` +
      `Please visit ${colors.dim(colors.underline("https://developer.1password.com/docs/service-accounts/get-started#create-a-service-account"))} for information on how to create a 1Password service account.`
  );

  const tokenAnswer = await prompts.password({
    message: "Enter your 1Password service account token here:",
    validate(value) {
      if (!value) return "Token cannot be empty";
      if (!value.startsWith("ops_")) return "Invalid 1Password token format";
    },
  });

  if (prompts.isCancel(tokenAnswer)) process.exit(1);

  await updateConfig({
    onePassword: {
      serviceToken: tokenAnswer,
    },
  });
}
