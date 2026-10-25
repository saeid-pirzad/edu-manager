"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto, pbkdf2Sync } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../assets/scripts/password-service.js"), "utf8");
function service(crypto = webcrypto) {
  const context = vm.createContext({ crypto, TextEncoder, Uint8Array });
  vm.runInContext(source, context);
  return context;
}

test("password hash matches independent PBKDF2 SHA-256 implementation", async () => {
  const api = service(), salt = Uint8Array.from({ length: 16 }, (_, i) => i);
  const password = "رمز آزمایش ۱۲۳";
  const expected = "pbkdf2$210000$" + Buffer.from(salt).toString("hex") + "$" + pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex");
  assert.equal(await api.hashPassword(password, salt), expected);
  assert.equal(await api.verifyPassword(password, expected), true);
  assert.equal(await api.verifyPassword(password + "x", expected), false);
});
test("new password hashes use distinct random salts and remain verifiable", async () => {
  const api = service();
  const first = await api.hashPassword("test"), second = await api.hashPassword("test");
  assert.match(first, /^pbkdf2\$210000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(await api.verifyPassword("test", first), true);
  assert.equal(await api.verifyPassword("test", second), true);
});
test("legacy plaintext passwords retain exact comparison behavior", async () => {
  const api = service();
  assert.equal(await api.verifyPassword("قدیمی", "قدیمی"), true);
  assert.equal(await api.verifyPassword("wrong", "قدیمی"), false);
});
test("malformed or unsupported password hashes are rejected", async () => {
  const api = service();
  for (const stored of ["pbkdf2$", "pbkdf2$1$aa$bb", "pbkdf2$210000$bad$bad"])
    assert.equal(await api.verifyPassword("test", stored), false);
});
test("hashing reports unavailable Web Crypto explicitly", async () => {
  await assert.rejects(service({}).hashPassword("test"), /مرورگر/);
});
