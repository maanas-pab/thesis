// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, passwordProblem, verifyPassword } from "../lib/password.ts";

test("a password verifies against its own hash and nothing else", () => {
  const h = hashPassword("correct-horse");
  assert.ok(verifyPassword("correct-horse", h));
  assert.ok(!verifyPassword("correct-horsf", h));
  assert.ok(!verifyPassword("", h));
});

test("the same password hashes differently each time (salted)", () => {
  assert.notEqual(hashPassword("same-password"), hashPassword("same-password"));
});

test("a malformed stored hash never verifies", () => {
  for (const bad of ["", "plain", "scrypt$1$2$3", "bcrypt$x$y$z$a$b"]) assert.ok(!verifyPassword("anything", bad));
});

test("short and huge passwords are refused, normal ones pass", () => {
  assert.ok(passwordProblem("short"));
  assert.ok(passwordProblem("x".repeat(201)));
  assert.equal(passwordProblem("eight888"), null);
});
