const failEarly = true;

export async function exec(
  cmds_: (string | boolean | number | string[] | undefined | null)[],
  options?: Bun.SpawnOptions.OptionsObject<"pipe", "pipe", "pipe">,
  options2: {
    noFailEarly?: boolean;
    onError?: (params: {
      stderr: string;
      preventFailEarly: () => void;
    }) => void;
  } = {}
) {
  const cmds = cmds_.flatMap(mapCmd);

  console.info(`[DEBUG][CMD][STARTED]`, `${cmds.join(" ")}`);

  let preventFailEarlyCalled = false;

  const result = Bun.spawnSync(cmds, options);
  if (result.success) console.log(result.stdout.toString());
  else {
    const stderr = result.stderr.toString();
    console.error(`[DEBUG][CMD][ERROR]`, stderr);

    options2.onError?.({
      stderr,
      preventFailEarly: () => {
        preventFailEarlyCalled = true;
      },
    });
  }

  console.info(
    `[DEBUG][CMD][EXITED]`,
    `${cmds.join(" ")}`,
    "=>",
    result.exitCode
  );

  if (
    failEarly &&
    !result.success &&
    !preventFailEarlyCalled &&
    !options2.noFailEarly
  ) {
    process.exit(result.exitCode);
  }

  return result;
}

// Converts an arbitrary string to a FQDN
export const toDomainNamePart = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replaceAll(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

const mapCmd = (i: unknown): string[] => {
  if (typeof i === "string") return [i];
  if (Array.isArray(i)) return i.flatMap(mapCmd);
  return [];
};
