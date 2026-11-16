import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createSignalServer } from "./server.js";
import { createLearningRunner } from "./learning.js";
import { parseProcessorConfig } from "./processor.js";

if (existsSync(".env")) process.loadEnvFile();

async function main(): Promise<void> {
  const { DATABASE_URL, PWM_PRINCIPALS_FILE } = process.env;
  if (!DATABASE_URL || !PWM_PRINCIPALS_FILE) {
    throw new Error("DATABASE_URL and PWM_PRINCIPALS_FILE are required");
  }
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  const processor = parseProcessorConfig(process.env);
  const principals: unknown = JSON.parse(await readFile(PWM_PRINCIPALS_FILE, "utf8"));
  const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 5_000 });
  pool.on("error", () => console.error("A database connection failed."));
  try {
    // Start only when the schema is installed. Migration is an explicit operator step.
    await pool.query("SELECT receipt_id, content_sha256, content_deleted_at, content_deletion_reason FROM signals LIMIT 0");
    await pool.query(`SELECT v.revision,c.input_identity,o.excerpt,a.metadata,l.observation_id,w.reason
      FROM model_state_versions v, semantic_commits c, observations o, model_assertions a, assertion_observations l, signal_learning_attempts w LIMIT 0`);
    const runner = createLearningRunner({ pool, ...(processor ? { processor } : {}) });
    const server = createSignalServer({ pool, principals });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    runner.start();
    console.log(`Signal API listening on http://127.0.0.1:${port}`);
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      const closed = new Promise<void>(resolve => server.close(() => resolve()));
      void Promise.all([closed, runner.stop()]).then(() => pool.end()).catch(() => {
        console.error("API shutdown failed."); process.exitCode = 1;
      });
      const deadline = setTimeout(() => {
        server.closeAllConnections();
        process.exit(1);
      }, 10_000);
      deadline.unref();
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  } catch (error) {
    await pool.end();
    throw error;
  }
}

main().catch(() => {
  // Configuration and driver errors may contain credentials or personal content.
  console.error("API startup failed. Check configuration, credentials, database connectivity and migrations.");
  process.exitCode = 1;
});
