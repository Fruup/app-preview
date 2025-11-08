import * as prompts from "@clack/prompts";
import * as colors from "nanocolors";
import { Readable } from "stream";

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
  const proc = Bun.spawn(cmds, { ...options, stderr: "pipe" });

  const log = prompts.taskLog({
    title: `Executing command: ${colors.dim(cmds.join(" "))}`,
    input: Readable.from(proc.stdout),
  });

  await proc.exited;

  if (proc.exitCode === 0) {
    log.success(`Command succeeded: ${colors.dim(cmds.join(" "))}`);
  } else {
    log.error(
      `Command failed with code ${proc.exitCode}: ${colors.dim(cmds.join(" "))}`
    );
    if (proc.stderr) log.error(await proc.stderr.text());
  }

  // if (
  //   failEarly &&
  //   !proc.success &&
  //   !preventFailEarlyCalled &&
  //   !options2.noFailEarly
  // ) {
  //   process.exit(proc.exitCode);
  // }

  return proc;
}

export async function exec2(
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

const mapCmd = (i: unknown): string[] => {
  if (typeof i === "string") return [i];
  if (Array.isArray(i)) return i.flatMap(mapCmd);
  return [];
};
