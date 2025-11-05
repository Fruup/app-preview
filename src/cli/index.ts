import { Command } from "commander";
import { Project } from "../project";
import * as prompts from "@clack/prompts";

const program = new Command();

program.name("app-preview").description("CLI for App Preview").version("0.0.1");

program
  .command("create")
  .description("Create a new app preview project")
  .action(async () => {
    const transformUrl = (input: string) => {
      if (!input.startsWith("http")) return `https://${input}`;
      return input;
    };

    const repo_ = await prompts.text({
      message: "Git repository URL:",
      validate(value_) {
        const value = transformUrl(value_);

        if (!URL.parse(value)) return "Please enter a valid URL";
      },
    });
    if (prompts.isCancel(repo_)) return;
    const repo = transformUrl(repo_);

    const branch = await prompts.text({
      message: "Git branch:",
      defaultValue: "main",
      // initialValue: "main",
      placeholder: "main",
    });
    if (prompts.isCancel(branch)) return;

    const defaultAppName = repo
      .slice(repo.lastIndexOf("/") + 1)
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
        repo,
        branch,
      },
    });

    await project.initialize();
  });

program.parse(Bun.argv);
