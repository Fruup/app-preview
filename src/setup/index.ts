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
    const answer = await prompts.text({
      message: "Public URL for your app (leave empty to use public IP):",
      initialValue: config.publicUrl || "",
      validate(value) {
        value ??= "";

        if (!URL.parse(value)) {
          return "Please enter a valid URL";
        }
      },
    });

    if (prompts.isCancel(answer)) process.exit(1);
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
        "--wait",
      ],
      {
        env: {
          API_HOST: `${URL.parse(publicUrl)!.hostname}`,
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
