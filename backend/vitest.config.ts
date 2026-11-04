<<<<<<< HEAD
import "dotenv/config";
=======
>>>>>>> a6cb2e5008ae2356aed6e92a0ca190475b0e0814
import { defineConfig } from "vitest/config";

/**
 * Tests run against a real MySQL/MariaDB (transactions, unique constraints and row locks are part of
 * what is being verified). Point TEST_DB_* at a disposable server; the database is dropped/recreated.
 */
export const testEnv = {
  NODE_ENV: "test",
<<<<<<< HEAD
  DB_HOST: process.env.TEST_DB_HOST ?? process.env.DB_HOST ?? "127.0.0.1",
  DB_PORT: process.env.TEST_DB_PORT ?? process.env.DB_PORT ?? "3306",
  DB_USER: process.env.TEST_DB_USER ?? process.env.DB_USER ?? "root",
  DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  DB_NAME: process.env.TEST_DB_NAME ?? process.env.DB_NAME ?? "edu_test",
=======
  DB_HOST: process.env.TEST_DB_HOST ?? "127.0.0.1",
  DB_PORT: process.env.TEST_DB_PORT ?? "3306",
  DB_USER: process.env.TEST_DB_USER ?? "root",
  DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? "",
  DB_NAME: process.env.TEST_DB_NAME ?? "edu_test",
>>>>>>> a6cb2e5008ae2356aed6e92a0ca190475b0e0814
  STORAGE_DRIVER: "memory",
  AI_PROVIDER: "fake",
  AI_AUTO_EVALUATE: "false", // tests trigger evaluation explicitly so statuses never change under them
  PAYMENT_PROVIDER: "fake",
  PAYMENT_WEBHOOK_SECRET: "test-webhook-secret",
  JWT_SECRET: "test-jwt-secret",
  MAX_UPLOAD_MB: "1",
  ADMIN_BOOTSTRAP_PASSWORD: "Admin@Test-1234",
  ADMIN_REQUIRE_PASSWORD_CHANGE: "false",
};

export default defineConfig({
  test: {
    globalSetup: ["tests/helpers/global-setup.ts"],
    env: testEnv,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["tests/**/*.test.ts"],
  },
});
