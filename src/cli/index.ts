import { Command } from "commander";
import { Project } from "../project";
import * as prompts from "@clack/prompts";
import * as colors from "nanocolors";
import { configureGithubIntegration, setup } from "../setup";

const program = new Command();

program.name("app-preview").description("CLI for App Preview").version("0.0.1");

program
  .name("app-preview")
  .command("github")
  .description("Manage GitHub integration")
  .command("setup")
  .description("Set up GitHub integration")
  .action(() => configureGithubIntegration());

program
  .command("setup")
  .description("Set up App Preview")
  .action(() => setup());

program
  .command("config")
  .description("Manage App Preview's configuration")
  .command("edit")
  .description("Edit the app-preview.config.json file")
  .action(async () => {
    if (!(await Bun.file("./app-preview.config.json").exists()))
      await Bun.write("./app-preview.config.json", "{}");

    prompts.log.message(
      `If it does not work automatically, open ${colors.bold("app-preview.config.json")} in your editor.`
    );

    Bun.openInEditor("./app-preview.config.json");
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
  });

program.parse(Bun.argv);
