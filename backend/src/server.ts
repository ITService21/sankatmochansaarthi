import { env } from "./config/env";
import { createApp } from "./app";
import { pendingMigrations } from "./infrastructure/database/migrate";
import { startScheduler } from "./infrastructure/scheduler";

const app = createApp();
app.listen(env.port, env.host, () => {
  console.log(`API listening on http://${env.host}:${env.port} (${env.nodeEnv}, storage=${env.storage.driver}, payments=${env.payment.provider})`);
});
startScheduler();

// New code on an old database fails with "Table ... doesn't exist" on the first request that needs it. Say so at startup instead.
pendingMigrations()
  .then((p) => { if (p.length) console.error(`[startup] DATABASE IS OUT OF DATE — ${p.length} migration(s) not applied: ${p.join(", ")}. Run "npm run migrate" in backend/ and restart.`); })
  .catch((e) => console.error("[startup] could not check migrations:", (e as Error).message));
