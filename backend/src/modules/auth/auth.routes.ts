import { Router } from "express";
import { authenticate } from "../../common/auth/authenticate";
import { asyncHandler } from "../../common/http/async-handler";
import { sendData } from "../../common/http/responses";
import { parseBody } from "../../common/validation/validate-body";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/app-error";
import { NONCE_COOKIE, oauthService } from "../oauth/oauth.service";
import { authService, changePasswordSchema, loginSchema, registerSchema } from "./auth.service";

/** Mounted at /api/v1/auth. */
export const authRouter = Router();

/** POST /register  body: registerSchema -> 201 `{ data: { token, user } }` */
authRouter.post("/register", asyncHandler(async (req, res) => sendData(res, await authService.register(parseBody(registerSchema, req.body)), 201)));

/** POST /login  body: `{ username, password }` -> `{ data: { token, user } }` */
authRouter.post("/login", asyncHandler(async (req, res) => sendData(res, await authService.login(parseBody(loginSchema, req.body)))));

/** GET /me -> `{ data: user }` (allowed while a password change is pending) */
authRouter.get("/me", authenticate({ allowPasswordChangePending: true }), asyncHandler(async (req, res) => sendData(res, await authService.me(req.user!.id))));

/** POST /change-password  body: `{ current_password, new_password }` -> `{ data: { changed: true } }` */
authRouter.post(
  "/change-password",
  authenticate({ allowPasswordChangePending: true }),
  asyncHandler(async (req, res) => sendData(res, await authService.changePassword(req.user!.id, parseBody(changePasswordSchema, req.body)))),
);

// ---------------------------------------------------------------------------------------------------------------------
// Social sign-in (Google / Microsoft). These are browser NAVIGATIONS (redirects), not JSON APIs.
// ---------------------------------------------------------------------------------------------------------------------
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: env.nodeEnv === "production", path: "/api/v1/auth/oauth", maxAge: 10 * 60_000 };
const readCookie = (header: string | undefined, name: string) => header?.split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === name)?.[1];
const fail = (code: string) => `${env.oauth.frontendUrl}/login?error=${encodeURIComponent(code)}`;

/** GET /oauth/providers -> `{ data: [{ name, label, configured }] }` (lets the UI show which buttons work). */
authRouter.get("/oauth/providers", (_req, res) => res.json({ data: oauthService.providers() }));

/** GET /oauth/:provider/start?role=Student|Teacher -> 302 to the provider (sets a short-lived httpOnly nonce cookie). */
authRouter.get("/oauth/:provider/start", (req, res) => {
  try {
    const { url, nonce } = oauthService.start(String(req.params.provider), typeof req.query.role === "string" ? req.query.role : undefined);
    res.cookie(NONCE_COOKIE, nonce, cookieOptions);
    res.redirect(url);
  } catch (e) {
    res.locals.errorInfo = e instanceof AppError ? { code: e.code, message: e.message } : { code: "OAUTH_ERROR", message: "Could not start sign-in" };
    res.redirect(fail(e instanceof AppError ? e.code : "OAUTH_ERROR"));
  }
});

/**
 * GET /oauth/:provider/callback?code&state -> 302 to `<FRONTEND_URL>/oauth/callback#token=<jwt>` on success
 * (token in the URL FRAGMENT so it never reaches server logs), or to `/login?error=<CODE>` on failure.
 */
authRouter.get("/oauth/:provider/callback", async (req, res) => {
  res.clearCookie(NONCE_COOKIE, { path: cookieOptions.path });
  if (typeof req.query.error === "string") return res.redirect(fail("ACCESS_DENIED"));
  try {
    const { token } = await oauthService.complete(String(req.params.provider), {
      code: typeof req.query.code === "string" ? req.query.code : undefined,
      state: typeof req.query.state === "string" ? req.query.state : undefined,
      cookieNonce: readCookie(req.headers.cookie, NONCE_COOKIE),
    });
    res.redirect(`${env.oauth.frontendUrl}/oauth/callback#token=${encodeURIComponent(token)}`);
  } catch (e) {
    const err = e instanceof AppError ? e : new AppError(500, "OAUTH_ERROR", "Sign-in failed");
    if (!(e instanceof AppError)) console.error("[oauth] unexpected", e);
    res.locals.errorInfo = { code: err.code, message: err.message };
    res.redirect(fail(err.code));
  }
});
