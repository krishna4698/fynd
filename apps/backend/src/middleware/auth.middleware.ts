import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "db";
import { env } from "../config/env.js";

const tokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  sid: z.string().uuid(),
  exp: z.number(),
});

export const requireAuth: RequestHandler = async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const authorization = req.get("authorization");
  const parts = authorization?.trim().split(/\s+/);

  if (
    !parts ||
    parts.length !== 2 ||
    parts[0]?.toLowerCase() !== "bearer" ||
    !parts[1]
  ) {
    res.status(401).json({ message: "Please log in to continue" });
    return;
  }

  let decoded: unknown;

  try {
    decoded = jwt.verify(parts[1], env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: "fynd-api",
      audience: "fynd-client",
    });
  } catch {
    res.status(401).json({
      message: "Your login has expired or is invalid. Please log in again",
    });
    return;
  }

  const payload = tokenPayloadSchema.safeParse(decoded);

  if (!payload.success) {
    res.status(401).json({ message: "Please log in again" });
    return;
  }

  const session = await prisma.session.findFirst({
    where: {
      id: payload.data.sid,
      userId: payload.data.sub,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, userId: true },
  });

  if (!session) {
    res.status(401).json({
      message: "Your session has ended. Please log in again",
    });
    return;
  }

  req.auth = {
    userId: session.userId,
    sessionId: session.id,
  };

  next();
};
