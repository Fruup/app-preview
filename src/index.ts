import { Project } from "./project";

const appName = Bun.argv[2];
if (!appName) {
  console.error("Please provide an app name as the first argument");
  process.exit(1);
}

const project = await Project.create(appName, {
  type: "local",
  path: "sources/app-1",
});

await project.up();
