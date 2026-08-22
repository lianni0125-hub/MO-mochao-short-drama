import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}
const { app } = await import("./app.js");
const { config } = await import("./config.js");
const { resumeJobs } = await import("./jobs.js");
resumeJobs();
app.listen(config.port, "127.0.0.1", () => console.log(`\nAI 短剧编剧工作台已启动：http://127.0.0.1:${config.port}\n`));
