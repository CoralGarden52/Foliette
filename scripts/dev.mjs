// 本地开发：同时启动 API 服务与 Vite 开发服务器
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const jobs = [
  { name: "server", cwd: fileURLToPath(new URL("../server/", import.meta.url)), args: ["--watch", "src/index.js"], color: "\x1b[36m" },
  { name: "web", cwd: fileURLToPath(new URL("../web/", import.meta.url)), args: ["node_modules/vite/bin/vite.js", "--configLoader", "runner", "--host", "0.0.0.0"], color: "\x1b[35m" },
];

const children = jobs.map((job) => {
  const child = spawn(process.execPath, job.args, {
    cwd: job.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: process.env,
  });
  const tag = `${job.color}[${job.name}]\x1b[0m`;
  const pipe = (stream, out) => {
    stream.setEncoding("utf8");
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) out.write(`${tag} ${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("error", (error) => {
    process.stderr.write(`${tag} ${error.message}\n`);
    shutdown(1);
  });
  child.on("exit", (code) => {
    process.stdout.write(`${tag} exited with code ${code}\n`);
    shutdown(code || 0);
  });
  return child;
});

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch {}
  }
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
