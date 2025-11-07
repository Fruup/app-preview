import { getPublicIp } from "../../utils";
import { loadConfig, updateConfig } from "../../config";
import * as gh from "@octokit/request";
import type { FastifyPluginCallback } from "fastify";

export const connectionRouter: FastifyPluginCallback = (fastify) => {
  let generatedState: string | undefined;

  fastify.get("/github/connection/start", async (request) => {
    console.log(request.method, request.url);

    const config = await loadConfig();

    const appUrl = config.publicUrl || `http://${await getPublicIp()}`;

    generatedState = crypto.randomUUID();

    const manifest = {
      name: `app-preview-${crypto.randomUUID().slice(0, 8)}`,
      url: appUrl,
      hook_attributes: {
        url: `${appUrl}/api/v1/github/webhooks`,
      },
      redirect_url: `${appUrl}/api/v1/github/connection/redirect`,
      public: false,
      default_permissions: {
        contents: "read",
        pull_requests: "read",
      },
      default_events: ["pull_request"],
    };

    return new Response(
      `
				<form action="https://github.com/settings/apps/new?state=${generatedState}" method="POST">
					<input type="hidden" name="manifest" value="">
					<button type="submit">Create GitHub App</button>
				</form>

				<script>
					const form = document.querySelector('form');
					const input = form.querySelector('input[name="manifest"]');
					input.value = JSON.stringify(${JSON.stringify(manifest)});
					form.submit();
				</script>
			`,
      {
        headers: { "Content-Type": "text/html" },
      }
    );
  });

  fastify.get("/github/connection/redirect", async (request, response) => {
    console.log(request.method, request.url);

    const url = new URL(request.url, "http://localhost");
    const returnedState = url.searchParams.get("state");

    if (returnedState !== generatedState) {
      console.error("Invalid state returned from GitHub");
      return response.status(400).send("Invalid state");
    }

    const code = url.searchParams.get("code");
    if (!code) {
      console.error("No code returned from GitHub");
      return response.status(400).send("No code received");
    }

    const { data } = await gh.request(
      "POST /app-manifests/{code}/conversions",
      {
        code,
      }
    );

    await updateConfig({
      githubApp: {
        id: data.id,
        name: data.name,
        pem: data.pem,
        clientId: data.client_id,
        clientSecret: data.client_secret,
        webhookSecret: data.webhook_secret,
      },
    });

    return response.redirect(
      `https://github.com/apps/${data.slug}/installations/new`
    );
  });
};
