import "express";

declare global {
  namespace Express {
    /** Authenticated principal attached by common/auth/authenticate.ts. */
    interface AuthUser {
      id: number;
      username: string;
      role: string;
      mustChangePassword: boolean;
    }
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}
export {};
