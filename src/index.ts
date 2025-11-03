import { Project } from "./project";

const project = await Project.create({
  appName: "app-1",
  source: {
    type: "local",
    path: "./sources/app-1",
  },
});

await project.up();
