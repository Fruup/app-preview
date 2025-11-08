import { z } from "zod";

// Helper schemas
const stringOrNumber = z.union([z.string(), z.number()]);
const stringOrArray = z.union([z.string(), z.array(z.string())]);
const envValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const mapOrArray = z.union([
  z.record(z.string(), z.string()),
  z.array(z.string()),
]);
const envMapOrArray = z.union([
  z.record(z.string(), envValue),
  z.array(z.string()),
]);

// Port mapping
const portSchema = z.union([
  z.string(),
  z.number(),
  z.object({
    target: z.number(),
    published: z.number().optional(),
    protocol: z.enum(["tcp", "udp"]).optional(),
    mode: z.enum(["host", "ingress"]).optional(),
  }),
]);

// Volume definition
const volumeSchema = z.union([
  z.string(),
  z.object({
    type: z.enum(["volume", "bind", "tmpfs", "npipe"]),
    source: z.string().optional(),
    target: z.string(),
    read_only: z.boolean().optional(),
    bind: z
      .object({
        propagation: z.string().optional(),
        create_host_path: z.boolean().optional(),
      })
      .optional(),
    volume: z
      .object({
        nocopy: z.boolean().optional(),
      })
      .optional(),
    tmpfs: z
      .object({
        size: z.number().optional(),
      })
      .optional(),
    content: z.string().optional(),
  }),
]);

// Network configuration
const networkConfigSchema = z.union([
  z.string(),
  z
    .object({
      aliases: z.array(z.string()).optional(),
      ipv4_address: z.string().optional(),
      ipv6_address: z.string().optional(),
      link_local_ips: z.array(z.string()).optional(),
      priority: z.number().optional(),
    })
    .nullable(),
]);

// Health check
const healthCheckSchema = z.object({
  test: stringOrArray.optional(),
  interval: z.string().optional(),
  timeout: z.string().optional(),
  retries: z.number().optional(),
  start_period: z.string().optional(),
  disable: z.boolean().optional(),
});

// Logging
const loggingSchema = z.object({
  driver: z.string().optional(),
  options: z.record(z.string(), z.string()).optional(),
});

// Deploy configuration
const deploySchema = z.object({
  mode: z.enum(["global", "replicated"]).optional(),
  replicas: z.number().optional(),
  labels: mapOrArray.optional(),
  update_config: z
    .object({
      parallelism: z.number().optional(),
      delay: z.string().optional(),
      failure_action: z.enum(["continue", "rollback", "pause"]).optional(),
      monitor: z.string().optional(),
      max_failure_ratio: z.number().optional(),
      order: z.enum(["stop-first", "start-first"]).optional(),
    })
    .optional(),
  rollback_config: z
    .object({
      parallelism: z.number().optional(),
      delay: z.string().optional(),
      failure_action: z.enum(["continue", "pause"]).optional(),
      monitor: z.string().optional(),
      max_failure_ratio: z.number().optional(),
      order: z.enum(["stop-first", "start-first"]).optional(),
    })
    .optional(),
  resources: z
    .object({
      limits: z
        .object({
          cpus: z.string().optional(),
          memory: z.string().optional(),
          pids: z.number().optional(),
        })
        .optional(),
      reservations: z
        .object({
          cpus: z.string().optional(),
          memory: z.string().optional(),
          generic_resources: z.array(z.record(z.string(), z.any())).optional(),
        })
        .optional(),
    })
    .optional(),
  restart_policy: z
    .object({
      condition: z.enum(["none", "on-failure", "any"]).optional(),
      delay: z.string().optional(),
      max_attempts: z.number().optional(),
      window: z.string().optional(),
    })
    .optional(),
  placement: z
    .object({
      constraints: z.array(z.string()).optional(),
      preferences: z.array(z.record(z.string(), z.any())).optional(),
      max_replicas_per_node: z.number().optional(),
    })
    .optional(),
  endpoint_mode: z.enum(["vip", "dnsrr"]).optional(),
});

// Build configuration
const buildSchema = z.union([
  z.string(),
  z.object({
    context: z.string().optional(),
    dockerfile: z.string().optional(),
    dockerfile_inline: z.string().optional(),
    args: mapOrArray.optional(),
    cache_from: z.array(z.string()).optional(),
    labels: mapOrArray.optional(),
    network: z.string().optional(),
    shm_size: stringOrNumber.optional(),
    target: z.string().optional(),
    extra_hosts: mapOrArray.optional(),
    isolation: z.string().optional(),
  }),
]);

// Service definition
const serviceSchema = z.object({
  image: z.string().optional(),
  build: buildSchema.optional(),
  container_name: z.string().optional(),
  command: stringOrArray.optional(),
  entrypoint: stringOrArray.optional(),
  environment: envMapOrArray.optional(),
  env_file: stringOrArray.optional(),
  ports: z.array(portSchema).optional(),
  expose: z.array(stringOrNumber).optional(),
  volumes: z.array(volumeSchema).optional(),
  networks: z
    .union([z.array(z.string()), z.record(z.string(), networkConfigSchema)])
    .optional(),
  depends_on: z
    .union([
      z.array(z.string()),
      z.record(
        z.string(),
        z.union([
          z.string(),
          z.object({
            condition: z
              .enum([
                "service_started",
                "service_healthy",
                "service_completed_successfully",
              ])
              .optional(),
            restart: z.boolean().optional(),
          }),
        ])
      ),
    ])
    .optional(),
  restart: z.enum(["no", "always", "on-failure", "unless-stopped"]).optional(),
  deploy: deploySchema.optional(),
  healthcheck: healthCheckSchema.optional(),
  // labels: mapOrArray.optional(),
  labels: z.array(z.string()).optional(),
  logging: loggingSchema.optional(),
  working_dir: z.string().optional(),
  user: z.string().optional(),
  hostname: z.string().optional(),
  domainname: z.string().optional(),
  mac_address: z.string().optional(),
  privileged: z.boolean().optional(),
  read_only: z.boolean().optional(),
  stdin_open: z.boolean().optional(),
  tty: z.boolean().optional(),
  stop_signal: z.string().optional(),
  stop_grace_period: z.string().optional(),
  security_opt: z.array(z.string()).optional(),
  cap_add: z.array(z.string()).optional(),
  cap_drop: z.array(z.string()).optional(),
  dns: stringOrArray.optional(),
  dns_search: stringOrArray.optional(),
  dns_opt: z.array(z.string()).optional(),
  tmpfs: stringOrArray.optional(),
  extra_hosts: mapOrArray.optional(),
  links: z.array(z.string()).optional(),
  external_links: z.array(z.string()).optional(),
  ulimits: z
    .record(
      z.string(),
      z.union([
        z.number(),
        z.object({
          soft: z.number(),
          hard: z.number(),
        }),
      ])
    )
    .optional(),
  sysctls: mapOrArray.optional(),
  userns_mode: z.string().optional(),
  pid: z.string().optional(),
  ipc: z.string().optional(),
  cgroup_parent: z.string().optional(),
  devices: z.array(z.string()).optional(),
  isolation: z.string().optional(),
  init: z.boolean().optional(),
  platform: z.string().optional(),
  profiles: z.array(z.string()).optional(),
  extends: z
    .union([
      z.string(),
      z.object({
        service: z.string(),
        file: z.string().optional(),
      }),
    ])
    .optional(),
});

// Top-level volume definition
const volumeDefinitionSchema = z
  .union([
    z.null(),
    z.object({
      driver: z.string().optional(),
      driver_opts: z.record(z.string(), z.string()).optional(),
      external: z
        .union([z.boolean(), z.object({ name: z.string() })])
        .optional(),
      labels: mapOrArray.optional(),
      name: z.string().optional(),
    }),
  ])
  .optional();

// Top-level network definition
const networkDefinitionSchema = z
  .object({
    driver: z.string().optional(),
    driver_opts: z.record(z.string(), z.string()).optional(),
    attachable: z.boolean().optional(),
    enable_ipv6: z.boolean().optional(),
    ipam: z
      .object({
        driver: z.string().optional(),
        config: z
          .array(
            z.object({
              subnet: z.string().optional(),
              ip_range: z.string().optional(),
              gateway: z.string().optional(),
              aux_addresses: z.record(z.string(), z.string()).optional(),
            })
          )
          .optional(),
        options: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    external: z.union([z.boolean(), z.object({ name: z.string() })]).optional(),
    internal: z.boolean().optional(),
    labels: mapOrArray.optional(),
    name: z.string().optional(),
  })
  .optional();

// Main Docker Compose schema
export const dockerComposeSchema = z.object({
  version: z.string().optional(),
  name: z.string().optional(),
  services: z.record(z.string(), serviceSchema),
  volumes: z.record(z.string(), volumeDefinitionSchema).optional(),
  networks: z.record(z.string(), networkDefinitionSchema.nullish()).optional(),
  configs: z
    .record(
      z.string(),
      z
        .object({
          file: z.string().optional(),
          external: z
            .union([z.boolean(), z.object({ name: z.string() })])
            .optional(),
          name: z.string().optional(),
          driver: z.string().optional(),
          driver_opts: z.record(z.string(), z.string()).optional(),
          template_driver: z.string().optional(),
        })
        .optional()
    )
    .optional(),
  secrets: z
    .record(
      z.string(),
      z
        .object({
          file: z.string().optional(),
          external: z
            .union([z.boolean(), z.object({ name: z.string() })])
            .optional(),
          name: z.string().optional(),
          driver: z.string().optional(),
          driver_opts: z.record(z.string(), z.string()).optional(),
          template_driver: z.string().optional(),
        })
        .optional()
    )
    .optional(),
});

export type DockerCompose = z.infer<typeof dockerComposeSchema>;
export type Service = z.infer<typeof serviceSchema>;
