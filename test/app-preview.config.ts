export default defineConfig(
  async ({ OnePasswordEnvGenerator, appNameDomainInfix }) => ({
    root: "test",
    dockerComposePath: "docker-compose.yml",
    envGenerator: await OnePasswordEnvGenerator.create(
      "op://Work/n5lqo3s7ncutk4cnungs5nf27y/env"
    ),
    expose: {
      test: {
        // domain: `${appNameDomainInfix}.app-preview.traefik.me`,
        domain: `app-preview-pr-11-test.88.99.35.245.nip.io`,
      },
    },
  })
);
