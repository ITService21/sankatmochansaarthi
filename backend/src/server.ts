import { env } from "./config/env";
import { createApp } from "./app";
import { pendingMigrations, runMigrations } from "./infrastructure/database/migrate";
import { startScheduler } from "./infrastructure/scheduler";

const app = createApp();
app.listen(env.port, env.host, () => {
  console.log(`API listening on http://${env.host}:${env.port} (${env.nodeEnv}, storage=${env.storage.driver}, payments=${env.payment.provider})`);
});
startScheduler();

// New code on an old database fails with "Table ... doesn't exist". In development the pending migrations are applied
// automatically; in production they must be run deliberately ("npm run migrate") so a deploy never alters the schema unseen.
pendingMigrations()
  .then(async (p) => {
    if (!p.length) return;
    if (env.nodeEnv === "production") return console.error(`[startup] DATABASE IS OUT OF DATE — ${p.length} migration(s) not applied: ${p.join(", ")}. Run "npm run migrate" in backend/ and restart.`);
    await runMigrations();
    console.log(`[startup] applied ${p.length} pending migration(s): ${p.join(", ")}`);
  })
  .catch((e) => console.error("[startup] could not check/apply migrations:", (e as Error).message));
