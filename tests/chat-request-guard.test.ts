import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_LIMITS,
  createMemoryRateLimiter,
  parseModelMode,
  validateChatMessages,
} from "../src/lib/chat-request-guard";

test("accepts only built-in model modes from the client", () => {
  assert.equal(parseModelMode(undefined), "auto");
  assert.equal(parseModelMode("fast"), "fast");
  assert.equal(parseModelMode("grok-4.3-high"), null);
});

test("validates chat message roles and content length", () => {
  assert.deepEqual(validateChatMessages([{ role: "user", content: "Hi" }]), {
    ok: true,
    messages: [{ role: "user", content: "Hi" }],
  });

  assert.deepEqual(validateChatMessages([{ role: "admin", content: "Hi" }]), {
    ok: false,
    error: "Invalid message role",
  });

  assert.deepEqual(
    validateChatMessages([
      { role: "user", content: "x".repeat(CHAT_LIMITS.maxMessageChars + 1) },
    ]),
    { ok: false, error: "Message is too long" }
  );
});

test("rate limiter rejects requests after the configured window quota", () => {
  let now = 1_000;
  const checkRateLimit = createMemoryRateLimiter({
    limit: 2,
    windowMs: 1_000,
    now: () => now,
  });

  assert.deepEqual(checkRateLimit("user-1"), { allowed: true, remaining: 1 });
  assert.deepEqual(checkRateLimit("user-1"), { allowed: true, remaining: 0 });
  assert.deepEqual(checkRateLimit("user-1"), {
    allowed: false,
    retryAfterSeconds: 1,
  });

  now = 2_000;
  assert.deepEqual(checkRateLimit("user-1"), { allowed: true, remaining: 1 });
});
