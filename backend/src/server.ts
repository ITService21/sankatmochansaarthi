import { env } from "./config/env";
import { createApp } from "./app";
import { startScheduler } from "./infrastructure/scheduler";

const app = createApp();
app.listen(env.port, env.host, () => {
  console.log(`API listening on http://${env.host}:${env.port} (${env.nodeEnv}, storage=${env.storage.driver}, payments=${env.payment.provider})`);
});
startScheduler();
