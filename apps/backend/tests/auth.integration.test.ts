import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";

// Explicit opt-in: never run against the application's normal DATABASE_URL.
const testDatabaseUrl = process.env.AUTH_TEST_DATABASE_URL;

test("signup and login persist secure account/session records", {
  skip: !testDatabaseUrl,
}, async () => {
  process.env.DATABASE_URL = testDatabaseUrl!;
  process.env.JWT_ACCESS_SECRET = "test-only-secret-with-at-least-32-characters";
  process.env.WEB_ORIGIN = "http://localhost:3000";
  process.env.NODE_ENV = "test";

  const { app } = await import("../src/app.js");
  const { prisma } = await import("db");
  const { default: bcrypt } = await import("bcrypt");
  const { default: jwt } = await import("jsonwebtoken");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/auth`;
  const username = `test_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const email = `${username}@example.com`;
  const password = "  correct password for testing  ";

  const post = (path: string, body: unknown, origin = process.env.WEB_ORIGIN!) => fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });

  try {
    assert.equal((await post("/register", { email: "invalid" })).status, 400);
    assert.equal((await post("/register", { email, username, password }, "https://other.example")).status, 403);

    const registration = await post("/register", {
      email: email.toUpperCase(), username: username.toUpperCase(), password,
      locationMode: "LIVE", nearbyDiscoveryEnabled: true,
    });
    assert.equal(registration.status, 201);
    const registrationBody = await registration.json();
    assert.equal(registrationBody.user.email, email);
    assert.equal("passwordHash" in registrationBody.user, false);

    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { profile: true } });
    assert.equal(user.profile, null);
    assert.equal(user.locationMode, "HIDDEN");
    assert.equal(user.nearbyDiscoveryEnabled, false);
    assert.notEqual(user.passwordHash, password);
    assert.equal(await bcrypt.compare(password, user.passwordHash), true);

    assert.equal((await post("/register", { email, username, password })).status, 409);
    assert.equal((await post("/login", { email, password: "wrong" })).status, 401);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    const missing = await post("/login", { email: `missing_${email}`, password });
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).message, "Invalid credentials");

    for (const loginEmail of [email, email.toUpperCase()]) {
      const response = await post("/login", { email: loginEmail, password });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = await response.json();
      assert.equal("passwordHash" in body.user, false);
      assert.equal("refreshToken" in body, false);
      const claims = jwt.verify(body.accessToken, process.env.JWT_ACCESS_SECRET!, {
        algorithms: ["HS256"], issuer: "fynd-api", audience: "fynd-client",
      });
      assert.ok(typeof claims !== "string");
      assert.equal(claims.sub, user.id);
      assert.equal(claims.exp! - claims.iat!, 900);

      const cookie = response.headers.get("set-cookie")!;
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Strict/i);
      assert.match(cookie, /Path=\/api\/auth/i);
      const rawToken = cookie.match(/^refreshToken=([^;]+)/)?.[1];
      assert.ok(rawToken);
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const storedToken = await prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash }, include: { session: true },
      });
      assert.equal(storedToken.session.id, claims.sid);
      assert.equal(storedToken.session.userId, user.id);
      assert.equal(storedToken.session.revokedAt, null);
    }
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 2);
  } finally {
    // Delete only the unique account created by this test; related rows cascade.
    try {
      await prisma.user.deleteMany({ where: { email, username } });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await prisma.$disconnect();
    }
  }
});
