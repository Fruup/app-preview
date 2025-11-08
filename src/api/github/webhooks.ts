import type { FastifyPluginCallback } from "fastify";
import {
  createNodeMiddleware,
  createWebMiddleware,
  Webhooks,
} from "@octokit/webhooks";
import { loadConfig } from "../../config";
import { Project } from "../../project";
import { toDomainNamePart } from "../../utils";

export const webhooksRouter: FastifyPluginCallback = (fastify) => {
  fastify.post("/github/webhooks", async (request, response) => {
    const webhooks = await getWebhooks();
    if (!webhooks) return response.status(500).send("Webhooks not configured");
    if (!_middleware)
      return response.status(500).send("Middleware not configured");

    await webhooks.verifyAndReceive({
      id: request.headers["x-github-hook-id"] as string,
      name: request.headers["x-github-event"] as string,
      signature: request.headers["x-hub-signature-256"] as string,
      payload: JSON.stringify(request.body),
    });
  });
};

let _webhooks: Webhooks | undefined = undefined;
let _middleware: ReturnType<typeof createNodeMiddleware> | undefined =
  undefined;

async function getWebhooks() {
  if (_webhooks) return _webhooks;

  console.log("Configuring GitHub webhooks...");

  const config = await loadConfig();
  const secret = config.githubApp?.webhookSecret;

  if (!secret) {
    console.error("No webhook secret configured");
    return;
  }

  _webhooks = new Webhooks({
    secret,
    log: console,
  });

  _webhooks.onError(async (error) => {
    console.error(`Error processing webhook event`, error);
  });

  _webhooks.on("pull_request", async ({ payload }) => {
    const {
      repository,
      number,
      pull_request: { head, draft },
    } = payload;

    const appName = `${toDomainNamePart(repository.name)}-pr-${number}`;

    const project = new Project({
      appName,
      source: {
        type: "git",
        repo: repository.html_url,
        branch: head.ref,
      },
    });

    await project.initialize();

    switch (payload.action) {
      case "opened":
      case "synchronize":
      case "reopened":
      case "ready_for_review":
        if (!draft) await project.up();
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
