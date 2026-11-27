import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "db";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  SESSION_LIFETIME_MS,
} from "../../utils/tokens.js";
import type { LoginInput, SignupInput } from "./auth.schema.js";

const safeUserSelect = {
  id: true,
  email: true,
  username: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export class AuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function signup(input: SignupInput) {
  const passwordHash = await bcrypt.hash(input.password, 10);

  try {
    console.log("trying register")
    return await prisma.user.create({
      data: {
        email: input.email,
        username: input.username,
        passwordHash,
      },
      select: safeUserSelect,
    });
  } catch (error) {
    // Unique constraints also handle concurrent requests with the same details.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AuthError(409, "Email is already in use");
    }
    throw error;
  }
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...safeUserSelect, passwordHash: true },
  });

  if (!user) {
    throw new AuthError(401, "Invalid credentials");
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new AuthError(401, "Invalid credentials");
  }

  const sessionId = randomUUID();
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  const accessToken = createAccessToken(user.id, sessionId);

  // Both records are created atomically; raw refresh tokens are never stored.
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      clientType: "WEB",
      expiresAt,
      refreshTokens: {
        create: { tokenHash: hashRefreshToken(refreshToken), expiresAt },
      },
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt,
    },
    accessToken,
    refreshToken,
    expiresAt,
  };
}
