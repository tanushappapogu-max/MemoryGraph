import { spawn, type ChildProcess } from "child_process";

const children: ChildProcess[] = [];
const args = process.argv.slice(2);
const fullCapture = args.includes("--full-capture") || process.env.MEMORYGRAPH_FULL_CAPTURE === "true";
const daemonPort = process.env.MEMORYGRAPH_PORT || "3033";
const nextPort = process.env.NEXT_PORT || "3000";

function start(name: string, command: string, childArgs: string[]) {
  const child = spawn(command, childArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  children.push(child);

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(prefixLines(name, chunk.toString()));
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(prefixLines(name, chunk.toString()));
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(`[dev] ${name} exited (${signal || (code ?? 0)}); stopping dev stack`);
    shutdown(code || 0);
  });

  return child;
}

function prefixLines(name: string, text: string) {
  return text
    .split(/\n/)
    .map((line, index, lines) => {
      if (line === "" && index === lines.length - 1) return "";
      return `[${name}] ${line}`;
    })
    .join("\n");
}

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(code), 350);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const daemonArgs = ["src/cli.ts", "start", "--port", daemonPort];
if (!fullCapture) {
  daemonArgs.push("--no-clipboard", "--no-cluely-sync");
}

console.log("[dev] starting MemoryGraph");
console.log(`[dev] daemon: http://127.0.0.1:${daemonPort}`);
console.log(`[dev] UI:     http://localhost:${nextPort}`);
console.log(fullCapture
  ? "[dev] full capture enabled: clipboard + Cluely directory watcher"
  : "[dev] capture sandboxed: UI/mic/API capture only; run npm run dev:full for clipboard + Cluely dir watch");

start("daemon", "tsx", daemonArgs);
start("next", "next", ["dev", "--port", nextPort]);
