export default defineConfig(
  ({ appName, appNameDomainInfix, OnePasswordEnvGenerator }) => ({
    expose: {
      studio: {
        domain: `studio.${appNameDomainInfix}.traefik.me`,
        basicAuth:
          "admin:$2y$05$AgQsjwdDNtbZrN7csn1K.OiNCwHdKxVbL.G2cLKkBz6iu36hBtLX6",
      },
    },
    dockerComposePath: "./docker-compose.yml",
    root: ".",
    envGenerator: new OnePasswordEnvGenerator({
      accessToken: Bun.env.OP_ACCESS_TOKEN!,
      itemUri: "op://Work/r37qblv6zfsowdhrthwigvlnii/env",
    }),
  })
);
