import { OnePasswordEnvGenerator } from "./env";
import { exec } from "./lib";
import { Project, type ProjectSource } from "./project";
import { parseArgs } from "node:util";

let {
  positionals: [appTemplateName],
  values: { pr: pullRequest, repo, dir: directory, root, branch },
} = parseArgs({
  allowPositionals: true,
  options: {
    repo: {
      type: "string",
    },
    pr: {
      type: "string",
    },
    dir: {
      type: "string",
    },
    root: {
      type: "string",
    },
    branch: {
      type: "string",
    },
  },
});

if (!appTemplateName) {
  console.error("Please provide an app template name as the first argument");
  process.exit(1);
}

let appName = appTemplateName;

if (branch) {
  appName += `_branch-${branch}`;
} else if (pullRequest) {
  appName += `_pr-${pullRequest}`;

  const pullRequestJson:
    | {
        id: string;
        number: number;
        title: string;
        headRefName: string;
      }
    | undefined = JSON.parse(
    (
      await exec([
        "gh",
        "pr",
        "list",
        "--base=main",
        "--state=open",
        "--draft=false",
        "--json",
        "id,number,title,headRefName",
        "--jq",
        `[.[] | select(.number == ${pullRequest})]`,
      ])
    ).stdout.toString()
  ).at(0);

  if (!pullRequestJson) {
    throw new Error(`Pull request #${pullRequest} not found`);
  }

  branch = pullRequestJson.headRefName;
}

const source: ProjectSource | undefined =
  repo && branch
    ? {
        type: "git",
        repo,
        branch,
      }
    : directory
    ? {
        type: "local",
        path: directory,
      }
    : undefined;

if (!source) {
  console.error("Please provide either a --repo and --pr or a --dir");
  process.exit(1);
}

console.log("Creating project with source:", source);

const project = await Project.create({
  appName,
  source,
  root,
  envGenerator: new OnePasswordEnvGenerator({
    accessToken: Bun.env.OP_ACCESS_TOKEN!,
    itemUri: "op://Work/r37qblv6zfsowdhrthwigvlnii/env",
  }),
});

await project.up();
