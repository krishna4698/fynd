import assert from "node:assert/strict";
import { test } from "node:test";
import { loginSchema, signupSchema } from "../src/modules/auth/auth.schema.js";

const validSignup = {
  email: " Person@Example.com ",
  username: " Person_123 ",
  password: "  My long password  ",
};

test("signup normalizes account identifiers but preserves the password", () => {
  const parsed = signupSchema.parse(validSignup);
  assert.equal(parsed.email, "person@example.com");
  assert.equal(parsed.username, "person_123");
  assert.equal(parsed.password, validSignup.password);
});

test("signup rejects invalid emails, usernames, and short passwords", () => {
  for (const patch of [
    { email: "invalid" },
    { username: "ab" },
    { username: "has spaces" },
    { password: "short" },
  ]) {
    assert.equal(signupSchema.safeParse({ ...validSignup, ...patch }).success, false);
  }
});

test("bcrypt limit is measured in UTF-8 bytes, not characters", () => {
  assert.equal(signupSchema.safeParse({ ...validSignup, password: "a".repeat(72) }).success, true);
  for (const password of ["a".repeat(73), "😀".repeat(19)]) {
    assert.equal(signupSchema.safeParse({ ...validSignup, password }).success, false);
    assert.equal(loginSchema.safeParse({ email: "person@example.com", password }).success, false);
  }
});

test("login does not enforce signup minimum length or change passwords", () => {
  const parsed = loginSchema.parse({ email: " Person@Example.com ", password: " Ab " });
  assert.equal(parsed.email, "person@example.com");
  assert.equal(parsed.password, " Ab ");
  assert.equal(loginSchema.safeParse({ email: "person@example.com", password: "" }).success, false);
});

test("login requires a valid email instead of a username or identifier", () => {
  assert.equal(loginSchema.safeParse({ email: "person", password: "password" }).success, false);
  assert.equal(loginSchema.safeParse({ identifier: "person@example.com", password: "password" }).success, false);
});

test("clients cannot override privacy defaults through signup", () => {
  const parsed = signupSchema.parse({
    ...validSignup,
    locationMode: "LIVE",
    nearbyDiscoveryEnabled: true,
  });
  assert.equal("locationMode" in parsed, false);
  assert.equal("nearbyDiscoveryEnabled" in parsed, false);
});
