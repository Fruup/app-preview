console.log("Hello from App Preview! 🦆");
console.log("Here are all of 🦆's secrets:");
console.log(Bun.env);

const server = Bun.serve({
  port: Bun.env.PORT,
  hostname: "0.0.0.0",
  fetch() {
    return new Response(
      `Hello from App Preview! 🦆 (sha=${Bun.env.COMMIT_SHA})\n` +
        "The current time is: " +
        new Date().toISOString()
    );
  },
});

console.log(`Server is running at ${server.url}`);
