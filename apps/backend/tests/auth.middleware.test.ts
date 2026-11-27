import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";

test("protected route verifies tokens and active sessions", async (t) => {
  // Database access is mocked; this URL is never connected to.
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/unused";
  process.env.JWT_ACCESS_SECRET = "test-only-secret-with-at-least-32-characters";
  process.env.WEB_ORIGIN = "http://localhost:3000";
  process.env.NODE_ENV = "test";

  const { app } = await import("../src/app.js");
  const { prisma } = await import("db");
  const { default: jwt } = await import("jsonwebtoken");
  const { createAccessToken } = await import("../src/utils/tokens.js");
  const userId = randomUUID();
  const sessionId = randomUUID();
  let sessionResult: { id: string; userId: string } | null = { id: sessionId, userId };
  let databaseError = false;
  const queries: unknown[] = [];
  const originalLookup = prisma.session.findFirst;
  prisma.session.findFirst = (async (query: unknown) => {
    queries.push(query);
    if (databaseError) throw new Error("Database unavailable");
    return sessionResult;
  }) as typeof prisma.session.findFirst;

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/auth/me`;
  const get = (authorization?: string) => fetch(url, {
    headers: authorization ? { Authorization: authorization } : {},
  });
  const sign = (payload: object, secret = process.env.JWT_ACCESS_SECRET!, algorithm: "HS256" | "HS384" = "HS256") =>
    jwt.sign(payload, secret, { algorithm });
  const claims = { sub: userId, sid: sessionId, iss: "fynd-api", aud: "fynd-client", exp: Math.floor(Date.now() / 1000) + 900 };

  try {
    await t.test("rejects missing/malformed headers and invalid tokens without a DB lookup", async () => {
      const invalidHeaders = [
        undefined,
        "Basic abc",
        "Bearer",
        "Bearer abc extra",
        "Bearer invalid-token",
        `Bearer ${sign(claims, "wrong-secret")}`,
        `Bearer ${sign(claims, undefined, "HS384")}`,
        `Bearer ${sign({ ...claims, exp: 1 })}`,
        `Bearer ${sign({ ...claims, aud: "other-app" })}`,
        `Bearer ${sign({ ...claims, iss: "other-issuer" })}`,
        `Bearer ${sign({ ...claims, sid: "invalid-uuid" })}`,
        `Bearer ${sign({ sub: userId, sid: sessionId, iss: "fynd-api", aud: "fynd-client" })}`,
      ];
      for (const header of invalidHeaders) {
        assert.equal((await get(header)).status, 401);
      }
      assert.equal(queries.length, 0);
    });

    const token = createAccessToken(userId, sessionId);
    await t.test("accepts a signed token and filters for its active session", async () => {
      const response = await get(`bearer ${token}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { userId });
      const query = queries[0] as {
        where: { id: string; userId: string; revokedAt: null; expiresAt: { gt: Date } };
      };
      assert.equal(query.where.id, sessionId);
      assert.equal(query.where.userId, userId);
      assert.equal(query.where.revokedAt, null);
      assert.ok(query.where.expiresAt.gt instanceof Date);
    });

    await t.test("rejects a token if no matching active session exists", async () => {
      sessionResult = null;
      assert.equal((await get(`Bearer ${token}`)).status, 401);
    });

    await t.test("database failures reach the server error handler", async () => {
      databaseError = true;
      assert.equal((await get(`Bearer ${token}`)).status, 500);
    });
  } finally {
    prisma.session.findFirst = originalLookup;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
