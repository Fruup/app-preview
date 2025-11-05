import { Project } from "./project";

const project = new Project({
  appName: "app-1",
  source: {
    type: "local",
    path: "./sources/app-1",
  },
});

// await project.up();
console.log(await project.status());
