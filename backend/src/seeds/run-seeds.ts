import { closePool } from "../infrastructure/database/database";
import { seedAcademicDemo } from "./academic-demo.seed";
import { seedDemoChapters } from "./demo-chapters.seed";
import { seedAcademicClasses } from "./academic-classes.seed";
import { seedAdministrator } from "./administrator.seed";
import { seedDefaultAccounts } from "./default-accounts.seed";
import { seedGlobalConfig } from "./global-config.seed";
import { seedSampleMaterials } from "./sample-materials.seed";
import { seedLanguages } from "./languages.seed";
import { seedMaterialTypes } from "./material-types.seed";
import { seedRoles } from "./roles.seed";
import { seedSubscriptionPlans } from "./subscription-plans.seed";

/**
 * Runs every seed in dependency order. Each seed is idempotent, so this is safe to re-run.
 * `--demo` additionally seeds sample academic taxonomy and demo chapters for every board/class/subject/stream; `--samples` seeds 50 sample notes (dev only);
 * `--accounts` creates the default Administrator / student1 / teacher1 accounts (also done by `npm run migrate`).
 */
export async function runSeeds(opts: { demo?: boolean; samples?: boolean; accounts?: boolean } = {}) {
  await seedRoles();
  // Default accounts first: when enabled they define the Administrator (no forced password change); the env-driven
  // administrator seed below then only acts if no Administrator exists (e.g. SEED_DEFAULT_ACCOUNTS=false).
  const accounts = opts.accounts ? await seedDefaultAccounts() : [];
  const admin = await seedAdministrator();
  await seedSubscriptionPlans();
  await seedGlobalConfig();
  await seedAcademicClasses();
  await seedMaterialTypes();
  await seedLanguages();
  const demo = opts.demo ? await seedAcademicDemo() : false;
  if (opts.demo) await seedDemoChapters(); // chapters for every board/class/subject/stream (idempotent)
  const samples = opts.samples ? await seedSampleMaterials() : 0;
  return { admin, demo, samples, accounts };
}

if (process.argv[1]?.endsWith("run-seeds.ts")) {
  runSeeds({ demo: process.argv.includes("--demo"), samples: process.argv.includes("--samples"), accounts: true })
    .then((r) => console.log("Seeds done:", r))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(closePool);
}
