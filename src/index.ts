import { Project } from "./project";

const project = await Project.create({
  appName: "solarstream-app",
  source: {
    type: "local",
    path: "./sources/solarstream-app",
  },
  root: ".docker",
  // dockerComposePath: ".docker/docker-compose.yml",
});

await project.up();
