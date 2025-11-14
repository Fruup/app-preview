import { Command } from "commander";
import { Project } from "../project";
import * as prompts from "@clack/prompts";
import * as colors from "nanocolors";
import { configureGithubIntegration, setup } from "../setup";
import { getGitHubApp } from "../api/github/app";
import { loadConfig, updateConfig } from "../config";

const program = new Command();

program.name("ap").description("CLI for App Preview").version("0.0.1");

program
  .command("github")
  .description("Manage GitHub integration")
  .command("setup")
  .description("Set up GitHub integration")
  .action(() => configureGithubIntegration());

program
  .command("setup")
  .description("Set up App Preview")
  .action(() => setup());

const configCommand = program
  .command("config")
  .description("Manage App Preview's configuration");

configCommand
  .command("open")
  .description("Open the app-preview.config.json file")
  .action(async () => {
    if (!(await Bun.file("./app-preview.config.json").exists()))
      await Bun.write("./app-preview.config.json", "{}");

    prompts.log.message(
      `If it does not work automatically, open ${colors.bold('"app-preview.config.json"')} in your editor.`
    );

    Bun.openInEditor("./app-preview.config.json");
  });

program
  .command("add")
  .description("Enable app preview for a repository")
  .argument(
    "[repository]",
    `GitHub repository in the format ${colors.dim("owner/repo")}`
  )
  .action(async (initialRepository) => {
    const loader = prompts.spinner();
    loader.start("Loading repos...");

    const app = await getGitHubApp();
    if (!app) {
      loader.stop("No GitHub App configured", 1);
      process.exit(1);
    }

    const config = await loadConfig();
    const installationId = config.githubApp?.installationId;
    if (!installationId) {
      loader.stop(
        "GitHub App installation ID not found in config. Is the GitHub integration set up?",
        1
      );
      process.exit(1);
    }

    const octokit = await app.getInstallationOctokit(installationId);
    const repos = await octokit
      .request("GET /installation/repositories")
      .then(async ({ data: { repositories: repos } }) =>
        Promise.all(
          repos.map(async ({ full_name, default_branch, owner, name }) => {
            const branches = await octokit
              .request("GET /repos/{owner}/{repo}/branches", {
                owner: owner.login,
                repo: name,
              })
              .then(({ data }) => data.map((branch) => branch.name));

            return {
              fullName: full_name,
              branches,
              defaultBranch: default_branch,
            };
          })
        )
      )
      .catch((e) => {
        loader.stop("Error fetching repositories:", 1);
        console.error(e);

        process.exit(1);
      });

    loader.stop();

    const repoAnswer = await prompts.autocomplete({
      message: "Select a repository:",
      options: repos.map((repo) => ({
        label: repo.fullName,
        value: repo.fullName,
      })),
      initialUserInput: initialRepository || "",
    });

    if (prompts.isCancel(repoAnswer)) return;

    const targetBranchAnswer = await prompts.select({
      message: "Select the target branch for previews:",
      options: repos
        .find((repo) => repo.fullName === repoAnswer)!
        .branches.map((branch) => ({
          label:
            branch +
            (branch ===
            repos.find((repo) => repo.fullName === repoAnswer)?.defaultBranch
              ? colors.green(" (default)")
              : ""),
          value: branch,
        })),
      initialValue: repos.find((repo) => repo.fullName === repoAnswer)
        ?.defaultBranch,
    });

    if (prompts.isCancel(targetBranchAnswer)) return;

    await updateConfig((config) => ({
      ...config,
      repositories: {
        ...config.repositories,
        [repoAnswer]: {
          enablePreview: true,
          targetBranch: targetBranchAnswer,
        },
      },
    }));

    prompts.log.success(
      `Enabled app preview for ${colors.bold(repoAnswer)} on branch ${colors.bold(targetBranchAnswer)}`
    );
  });

program
  .command("create")
  .description("Create a new app preview project")
  .action(async () => {
    const transformUrl = (input: string) => {
      if (!input.startsWith("github.com")) input = `github.com/${input}`;
      if (!input.startsWith("http")) input = `https://${input}`;
      return input;
    };

    const repo_ = await prompts.text({
      message: "Git repository URL:",
      validate(value_) {
        if (!value_) return "Repository URL cannot be empty";
        const value = transformUrl(value_);

        if (!URL.parse(value)) return "Please enter a valid URL";
      },
    });
    if (prompts.isCancel(repo_)) return;
    const repoUrl = transformUrl(repo_);

    const branch = await prompts.text({
      message: "Git branch:",
      defaultValue: "main",
      // initialValue: "main",
      placeholder: "main",
    });
    if (prompts.isCancel(branch)) return;

    const defaultAppName = repoUrl
      .slice(repoUrl.lastIndexOf("/") + 1)
      .replace(/[^a-zA-Z0-9]+/g, "-");

    const appName = await prompts.text({
      message: "App name:",
      initialValue: defaultAppName,
      defaultValue: defaultAppName,
      validate(value) {
        if (!value) return "App name cannot be empty";
      },
    });
    if (prompts.isCancel(appName)) return;

    const project = new Project({
      appName,
      source: {
        type: "git",
        repoUrl,
        branch,
      },
    });

    await project.initialize();
    await project.up();
  });

program.parse(Bun.argv);
