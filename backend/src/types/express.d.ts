import type { AuthContext } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
    requestId?: string;
    auth?: AuthContext;
    }
  }
}

export {};
