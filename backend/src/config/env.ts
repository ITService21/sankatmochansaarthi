import "dotenv/config";

/**
 * Typed, validated view of process environment variables.
 * Everything environment-specific (secrets, hosts, drivers) is read here once;
 * the rest of the code imports `env` and never touches process.env directly.
 */
function str(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required environment variable ${name}`);
  return v;
}
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be a number`);
  return n;
}

export const env = {
  nodeEnv: str("NODE_ENV", "development"),
  port: num("PORT", 4000),
  /** Interface to listen on. Use 127.0.0.1 behind Nginx so the API is not reachable directly from the internet. */
  host: str("HOST", "0.0.0.0"),
  corsOrigin: str("CORS_ORIGIN", "http://localhost:5173"),
  jwtSecret: str("JWT_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-only-secret-change-me"),
  jwtExpiresIn: str("JWT_EXPIRES_IN", "8h"),
  db: {
    host: str("DB_HOST", "127.0.0.1"),
    port: num("DB_PORT", 3306),
    user: str("DB_USER", "root"),
    password: str("DB_PASSWORD", ""),
    database: str("DB_NAME", "education_site"),
  },
  admin: {
    username: str("ADMIN_USERNAME", "Administrator"),
    bootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "",
    requirePasswordChange: (process.env.ADMIN_REQUIRE_PASSWORD_CHANGE ?? "true") !== "false",
  },
  storage: {
    driver: str("STORAGE_DRIVER", "local") as "s3" | "local" | "memory",
    localDir: str("LOCAL_STORAGE_DIR", "./storage-data"),
    region: str("AWS_REGION", "ap-south-1"),
    bucket: process.env.S3_BUCKET ?? "",
  },
  oauth: {
    /** Base URL the browser uses to reach this API (the Vite dev server proxies /api, so :5173 in development). Redirect URIs are built from it. */
    redirectBase: str("OAUTH_REDIRECT_BASE", "http://localhost:5173"),
    /** Where users are sent after sign-in. */
    frontendUrl: str("FRONTEND_URL", "http://localhost:5173"),
    google: { clientId: process.env.GOOGLE_CLIENT_ID ?? "", clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "" },
    microsoft: { clientId: process.env.MICROSOFT_CLIENT_ID ?? "", clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "", tenant: str("MICROSOFT_TENANT", "common") },
  },
  maxUploadMb: num("MAX_UPLOAD_MB", 25),
  payment: {
    provider: str("PAYMENT_PROVIDER", "fake") as "fake" | "razorpay",
    webhookSecret: str("PAYMENT_WEBHOOK_SECRET", "dev-webhook-secret"),
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  },
};
