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
    if (!request.rawBody) return response.status(400).send("No raw body found");

    await webhooks.verifyAndReceive({
      id: request.headers["x-github-hook-id"] as string,
      name: request.headers["x-github-event"] as string,
      signature: request.headers["x-hub-signature-256"] as string,
      payload: request.rawBody.toString("utf-8"),
    });
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

  _webhooks.on("pull_request", async ({ payload, octokit }) => {
    const { repository, number, pull_request } = payload;

    const config = await loadConfig();
    const repoConfig = config.repositories[repository.full_name];

    if (!repoConfig?.enablePreview) return;
    if (pull_request.base.ref !== repoConfig.targetBranch) return;

    const appName = `${toDomainNamePart(repository.name)}-pr-${number}`;

    const project = new Project({
      appName,
      source: {
        type: "git",
        repo: repository.html_url,
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

          // TODO: comment

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
