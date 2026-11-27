import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;

export function createAccessToken(userId: string, sessionId: string): string {
  return jwt.sign({ sid: sessionId }, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    subject: userId,
    issuer: "fynd-api",
    audience: "fynd-client",
    expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
  });
}

export function createRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
