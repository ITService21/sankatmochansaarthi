import "express";

declare global {
  namespace Express {
    /** Authenticated principal attached by common/auth/authenticate.ts. */
    interface AuthUser {
      id: number;
      username: string;
      role: string;
      mustChangePassword: boolean;
      /** Feature permissions (Administrator = all). */
      permissions: string[];
      /** Board/class/subject restriction for an Admin (empty arrays = unrestricted). */
      scopes: { board_ids: number[]; class_ids: number[]; subject_ids: number[] };
    }
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}
export {};
