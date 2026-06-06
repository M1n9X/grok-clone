export const MODEL_MODES = ["fast", "auto", "expert"] as const;

export type ModelMode = (typeof MODEL_MODES)[number];

export interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string;
}

const VALID_ROLES = new Set(["system", "user", "assistant"]);

export const CHAT_LIMITS = {
  maxMessages: 100,
  maxMessageChars: 20_000,
  maxTotalChars: 100_000,
  rateLimitWindowMs: 60_000,
  rateLimitRequests: 20,
};

export function parseModelMode(value: unknown): ModelMode | null {
  if (value === undefined || value === null || value === "") return "auto";
  return typeof value === "string" && MODEL_MODES.includes(value as ModelMode)
    ? (value as ModelMode)
    : null;
}

export function validateChatMessages(value: unknown):
  | { ok: true; messages: ChatMessageInput[] }
  | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "Invalid messages" };
  }

  if (value.length > CHAT_LIMITS.maxMessages) {
    return { ok: false, error: "Too many messages" };
  }

  let totalChars = 0;
  const messages: ChatMessageInput[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid message" };
    }

    const { role, content } = item as Record<string, unknown>;
    if (typeof role !== "string" || !VALID_ROLES.has(role)) {
      return { ok: false, error: "Invalid message role" };
    }

    if (typeof content !== "string" || content.trim().length === 0) {
      return { ok: false, error: "Invalid message content" };
    }

    if (content.length > CHAT_LIMITS.maxMessageChars) {
      return { ok: false, error: "Message is too long" };
    }

    totalChars += content.length;
    if (totalChars > CHAT_LIMITS.maxTotalChars) {
      return { ok: false, error: "Conversation is too long" };
    }

    messages.push({
      role: role as ChatMessageInput["role"],
      content,
    });
  }

  return { ok: true, messages };
}

export function createMemoryRateLimiter({
  limit,
  windowMs,
  now = () => Date.now(),
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const buckets = new Map<string, { count: number; windowStart: number }>();

  return function checkRateLimit(key: string):
    | { allowed: true; remaining: number }
    | { allowed: false; retryAfterSeconds: number } {
    const currentTime = now();
    const bucket = buckets.get(key);

    if (!bucket || currentTime - bucket.windowStart >= windowMs) {
      buckets.set(key, { count: 1, windowStart: currentTime });
      return { allowed: true, remaining: limit - 1 };
    }

    if (bucket.count >= limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowMs - (currentTime - bucket.windowStart)) / 1000)
      );
      return { allowed: false, retryAfterSeconds };
    }

    bucket.count += 1;
    return { allowed: true, remaining: limit - bucket.count };
  };
}
