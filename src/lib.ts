import * as prompts from "@clack/prompts";
import * as colors from "nanocolors";
import { Readable } from "stream";
import { customAlphabet } from "nanoid";
import { eraseLines } from "ansi-escapes";

const id = customAlphabet("abcdefghijklmnopqrstuvwxyz", 5);

export async function exec(
  cmds_: (string | false | number | string[] | undefined | null)[],
  {
    failEarly = false,
    expectedErrors,
    ...spawnOptions
  }: Bun.SpawnOptions.OptionsObject<"pipe", "pipe", "pipe"> & {
    failEarly?: boolean;
    expectedErrors?: string[];
  } = {}
) {
  const procId = id();

  const cmds = cmds_.flatMap(mapCmd);
  const proc = Bun.spawn(cmds, {
    ...spawnOptions,
    stdout: "pipe",
    stderr: "pipe",
  });

  const log = prompts.taskLog({
    title: colors.dim(cmds.join(" ")),
    input: Readable.from(proc.stdout),
  });

  // Live log output
  {
    await Bun.$`mkdir -p ./.logs/`;

    const maxLines = 20;
    let lines: any[] = [];
    let linesWritten = 0;
    const stdoutReader = proc.stdout.getReader();

    const stdoutLogFile = Bun.file(`./.logs/${procId}.stdout`);
    const stdoutLogWriter = stdoutLogFile.writer();

    while (true) {
      const data = await stdoutReader.read();

      if (data.value) {
        Bun.stdout.write(
          eraseLines(lines.length + 1 + (linesWritten > maxLines ? 1 : 0))
        );

        stdoutLogWriter.write(data.value);
        lines.push(data.value);
        const overflowing = lines.length > maxLines;

        if (overflowing) {
          lines = lines.slice(lines.length - maxLines);

          const filename = `./.logs/${procId}.stdout`;

          Bun.stdout.write(
            `⏫︎ ${linesWritten - maxLines} more lines ⏫︎ See "${colors.dim(filename)}" for the full log.\n`
          );
        }

        lines.forEach((line) => Bun.stdout.write(line));

        linesWritten++;
      }

      if (data.done) break;
    }
  }

  await proc.exited;

  // TODO: write stderr to file

  if (proc.exitCode === 0) {
    log.success(`✅ ${colors.dim(cmds.join(" "))}`);
  } else {
    const error = proc.stderr ? await proc.stderr.text() : undefined;

    if (error && expectedErrors?.some((expected) => error.includes(expected))) {
      log.success(
        `Command failed with expected error: ${colors.dim(cmds.join(" "))}` +
          (error ? `\n\n${error}` : "")
      );

      return proc;
    }

    log.error(
      `Command failed with code ${proc.exitCode}: ${colors.dim(cmds.join(" "))}` +
        (error ? `\n\n${error}` : ""),
      { showLog: true }
    );

    if (failEarly) {
      prompts.cancel("Exiting due to failure.");
      process.exit(proc.exitCode);
    }
  }

  return proc;
}

const mapCmd = (i: unknown): string[] => {
  if (typeof i === "string") return [i];
  if (typeof i === "number") return [i.toString()];
  if (Array.isArray(i)) return i.flatMap(mapCmd);
  return [];
};
