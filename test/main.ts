console.log("Hello from App Preview! 🦆");
console.log("Here are all of 🦆's secrets:");
console.log(Bun.env);

Bun.serve({
  port: Bun.env.PORT,
  hostname: "0.0.0.0",
  fetch(req, server) {
    return new Response("Hello from App Preview! 🦆");
  },
});
