import { createClient, getAuthUserId } from "@/lib/supabase/server";
import {
  buildModelRequest,
  encodeStreamEvent,
  extractChatCompletionEvents,
  extractResponsesApiEvents,
  type ChatStreamEvent,
} from "@/lib/chat-stream-events";
import {
  CHAT_LIMITS,
  createMemoryRateLimiter,
  parseModelMode,
  validateChatMessages,
  type ModelMode,
} from "@/lib/chat-request-guard";

export const maxDuration = 60;

const MODEL_CONFIG: Record<
  ModelMode,
  {
    model: string;
    reasoningEffort: "none" | "low" | "medium" | "high";
    statusLabel: string;
  }
> = {
  fast: {
    model: process.env.OPENAI_MODEL_FAST ?? "grok-4.3",
    reasoningEffort: "none",
    statusLabel: "Starting fast response",
  },
  auto: {
    model: process.env.OPENAI_MODEL_AUTO ?? "grok-4.3",
    reasoningEffort: "low",
    statusLabel: "Thinking",
  },
  expert: {
    model: process.env.OPENAI_MODEL_EXPERT ?? "grok-4.3",
    reasoningEffort: "high",
    statusLabel: "Thinking",
  },
};

const checkChatRateLimit = createMemoryRateLimiter({
  limit: readPositiveInt(
    process.env.CHAT_RATE_LIMIT_REQUESTS,
    CHAT_LIMITS.rateLimitRequests
  ),
  windowMs: readPositiveInt(
    process.env.CHAT_RATE_LIMIT_WINDOW_MS,
    CHAT_LIMITS.rateLimitWindowMs
  ),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const userId = await getAuthUserId(supabase);

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, model, webSearch, xSearch } = payload as {
    messages?: unknown;
    model?: unknown;
    webSearch?: unknown;
    xSearch?: unknown;
  };

  const modelMode = parseModelMode(model);
  if (!modelMode) {
    return Response.json({ error: "Invalid model" }, { status: 400 });
  }

  const validation = validateChatMessages(messages);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const rateLimit = checkChatRateLimit(userId);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many requests. Please wait before trying again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  const selectedConfig = MODEL_CONFIG[modelMode];
  const resolvedModel = selectedConfig.model;
  const reasoningEffort = selectedConfig.reasoningEffort;
  const statusLabel = selectedConfig.statusLabel;
  const baseURL = (
    process.env.OPENAI_API_BASE_URL ?? "https://api.x.ai/v1"
  ).replace(/\/$/, "");
  const apiKey = process.env.OPENAI_API_KEY || process.env.XAI_API_KEY || "";
  const forceResponsesApi =
    process.env.GROK_USE_RESPONSES_API === "false" ? false : undefined;

  const typedMessages = validation.messages;

  if (!apiKey) {
    return Response.json(
      { error: "Missing OPENAI_API_KEY or XAI_API_KEY" },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();
  let upstreamAbort: AbortController | null = null;

  const outputStream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: ChatStreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeStreamEvent(event)));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      try {
        const wantsSearch = Boolean(webSearch) || Boolean(xSearch);
        // One status before the upstream round-trip: search-aware so the UI
        // does not sit on a generic "Thinking" while tools run.
        send({
          type: "status",
          label: wantsSearch
            ? webSearch && xSearch
              ? "Searching the web & X"
              : webSearch
                ? "Searching the web"
                : "Searching X"
            : statusLabel,
        });

        upstreamAbort = new AbortController();
        const modelRequest = buildModelRequest({
          baseURL,
          model: resolvedModel,
          messages: typedMessages,
          reasoningEffort,
          webSearch: Boolean(webSearch),
          xSearch: Boolean(xSearch),
          forceResponsesApi,
        });
        const apiRes = await fetch(modelRequest.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(modelRequest.body),
          signal: upstreamAbort.signal,
        });

        if (!apiRes.ok) {
          const errText = await apiRes.text();
          console.error("[chat] API error:", apiRes.status, errText);
          send({
            type: "error",
            message: `Model API error (${apiRes.status}): ${errText}`,
          });
          close();
          return;
        }

        if (!apiRes.body) {
          send({ type: "error", message: "No response body from model" });
          close();
          return;
        }

        await pipeSseEvents(
          apiRes.body,
          modelRequest.useResponsesApi,
          reasoningEffort,
          send,
        );
        send({ type: "done" });
        close();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          close();
          return;
        }
        console.error("[chat] stream error:", err);
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Stream error",
        });
        close();
      }
    },
    cancel() {
      upstreamAbort?.abort();
    },
  });

  return new Response(outputStream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function pipeSseEvents(
  body: ReadableStream<Uint8Array>,
  useResponsesApi: boolean,
  reasoningEffort: string,
  send: (event: ChatStreamEvent) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const payload = trimmed.slice(6);
      if (payload === "[DONE]") return;

      try {
        const json = JSON.parse(payload);
        const events = useResponsesApi
          ? extractResponsesApiEvents(json)
          : extractChatCompletionEvents(json);
        for (const event of events) {
          if (reasoningEffort === "none" && event.type === "thinking") continue;
          send(event);
        }
      } catch {
        // Ignore comments and malformed upstream lines.
      }
    }
  }
}
