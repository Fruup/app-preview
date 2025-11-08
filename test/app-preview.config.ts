export default defineConfig(
  async ({ OnePasswordEnvGenerator, appNameDomainInfix }) => ({
    root: "test",
    dockerComposePath: "docker-compose.yml",
    envGenerator: await OnePasswordEnvGenerator.create(
      "op://Work/n5lqo3s7ncutk4cnungs5nf27y/env"
    ),
    expose: {
      test: {
        domain: `${appNameDomainInfix}.127-0-0-1.sslip.io`,
      },
    },
  })
);
