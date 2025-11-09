import fastify, { type FastifyPluginCallback } from "fastify";
import { webhooksRouter } from "./github/webhooks";
import { connectionRouter } from "./github/connection";

const app = fastify();

const v1: FastifyPluginCallback = async (fastify) => {
  await app.register(import("fastify-raw-body"), {
    field: "rawBody", // change the default request.rawBody property name
    global: true, // add the rawBody to every request. **Default true**
    encoding: "utf8", // set it to false to set rawBody as a Buffer **Default utf8**
  });

  fastify.register(connectionRouter);
  fastify.register(webhooksRouter);
};

app.register(v1, { prefix: "/api/v1" });

await app.listen({ port: 3000, host: "0.0.0.0" });
console.log("Server listening on http://localhost:3000");

console.log(app.printRoutes());
