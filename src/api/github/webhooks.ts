import type { FastifyPluginCallback } from "fastify";
import { createNodeMiddleware, createWebMiddleware } from "@octokit/webhooks";
import { loadConfig } from "../../config";
import { Project } from "../../project";
import { toDomainNamePart } from "../../utils";
import { getGitHubApp } from "./app";
import type { App } from "@octokit/app";

export const webhooksRouter: FastifyPluginCallback = (fastify) => {
  fastify.post("/github/webhooks", async (request, response) => {
    const webhooks = await getWebhooks();
    if (!webhooks) return response.status(500).send("Webhooks not configured");
    if (!_middleware)
      return response.status(500).send("Middleware not configured");

    // if (typeof request.rawBody !== "string")
    //   return response.status(400).send("No raw body found or not a string");

    const event = {
      id: request.headers["x-github-delivery"] as string,
      name: request.headers["x-github-event"] as any,
      payload: request.body as any,
    };

    console.debug("[DEBUG]", "event =", event);

    // TODO: Having trouble verifying requests. Using receive as a workaround for now.
    await webhooks
      .receive({
        id: request.headers["x-github-delivery"] as string,
        name: request.headers["x-github-event"] as any,
        payload: request.body as any,
      })
      .catch((error) => {
        console.error("Error processing webhook:", error);
      });

    // See https://github.com/octokit/webhooks.js#webhooksverifyandreceive
    // await webhooks
    //   .verifyAndReceive({
    //     id: request.headers["x-github-delivery"] as string,
    //     name: request.headers["x-github-event"] as string,
    //     signature: request.headers["x-hub-signature-256"] as string,
    //     payload: request.rawBody as string,
    //   })
    //   .catch((error) => {
    //     console.error("Error processing webhook:", error);
    //   });
  });
};

let _webhooks: App["webhooks"] | undefined = undefined;
let _middleware: ReturnType<typeof createNodeMiddleware> | undefined =
  undefined;

async function getWebhooks() {
  if (_webhooks) return _webhooks;

  const app = await getGitHubApp();
  if (!app) {
    console.error("No GitHub App configured");
    return;
  }

  _webhooks = app.webhooks;

  _webhooks.onError(async (error) => {
    console.error(`Error processing webhook event`, error);
  });

  _webhooks.on("pull_request", async ({ payload }) => {
    const { repository, number, pull_request } = payload;

    const config = await loadConfig();
    const repoConfig = config.repositories[repository.full_name];

    if (!repoConfig?.enablePreview) {
      console.warn(
        `Preview environments not enabled for repository ${repository.full_name}`
      );
      return;
    }
    if (pull_request.base.ref !== repoConfig.targetBranch) {
      console.warn(
        `Pull request base branch ${pull_request.base.ref} does not match target branch ${repoConfig.targetBranch}`
      );
      return;
    }

    const appName = `${toDomainNamePart(repository.name)}-pr-${number}`;

    const project = new Project({
      appName,
      source: {
        type: "git",
        repoUrl: repository.html_url,
        branch: pull_request.head.ref,
      },
    });

    await project.initialize();

    switch (payload.action) {
      case "opened":
      case "synchronize":
      case "reopened":
      case "ready_for_review":
        if (!pull_request.draft) {
          await project.up();

          // TODO: comment - needs permission

          // await octokit.request(
          //   "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments",
          //   {
          //     owner: repository.owner.login,
          //     repo: repository.name,
          //     pull_number: number,
          //     body: `Preview environment for this pull request is available :)`,
          //     // commit_id: payload.pull_request.head.sha,
          //     // path: "",
          //   }
          // );
        }
        break;

      case "closed":
      case "converted_to_draft":
        await project.down();
        break;
    }
  });

  _middleware = createWebMiddleware(_webhooks, {
    path: "/api/v1/github/webhooks",
  });

  return _webhooks;
}
