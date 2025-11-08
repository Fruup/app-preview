defineConfig(({ OnePasswordEnvGenerator, appNameDomainInfix }) => ({
  root: "test",
  dockerComposePath: "test/docker-compose.yml",
  envGenerator: OnePasswordEnvGenerator.create(
    "op://Work/n5lqo3s7ncutk4cnungs5nf27y/env"
  ),
  expose: {
    test: {
      domain: `${appNameDomainInfix}.traefik.me`,
    },
  },
}));
