import { createClient, getAuthUserId } from "@/lib/supabase/server";
import {
  buildModelRequest,
  encodeStreamEvent,
  extractChatCompletionEvents,
  extractResponsesApiEvents,
  SEARCH_CONTINUATION_INSTRUCTION,
  shouldContinueAfterSearchMiss,
  type ChatStreamEvent,
  type StreamPipeStats,
} from "@/lib/chat-stream-events";
import {
  CHAT_LIMITS,
  createMemoryRateLimiter,
  parseModelMode,
  validateChatMessages,
  type ModelMode,
} from "@/lib/chat-request-guard";

// Reasoning + optional search can exceed the old 60s ceiling; keep headroom
// for grok-4.5 medium/high effort on Vercel fluid/pro runtimes.
export const maxDuration = 300;

const MODEL_CONFIG: Record<
  ModelMode,
  {
    model: string;
    // grok-4.5 supports low/medium/high only (reasoning cannot be disabled).
    reasoningEffort: "none" | "low" | "medium" | "high";
    statusLabel: string;
  }
> = {
  fast: {
    model: process.env.OPENAI_MODEL_FAST ?? "grok-4.5",
    reasoningEffort: "low",
    statusLabel: "Starting fast response",
  },
  auto: {
    model: process.env.OPENAI_MODEL_AUTO ?? "grok-4.5",
    reasoningEffort: "medium",
    statusLabel: "Thinking",
  },
  expert: {
    model: process.env.OPENAI_MODEL_EXPERT ?? "grok-4.5",
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

  const lastUserMessage = [...typedMessages]
    .reverse()
    .find((m) => m.role === "user")?.content;
  // Only the UI toggles attach server-side tools. In-text "请联网搜索" is still
  // recognized so the no-tools system prompt forbids fake "正在搜索…" preludes
  // and (if a toggled tool call still misses) continuation can kick in.
  const webSearchEnabled = Boolean(webSearch);
  const xSearchEnabled = Boolean(xSearch);
  const toolsRequested = webSearchEnabled || xSearchEnabled;

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
        // One status before the upstream round-trip: search-aware so the UI
        // does not sit on a generic "Thinking" while tools run.
        send({
          type: "status",
          label: toolsRequested
            ? webSearchEnabled && xSearchEnabled
              ? "Searching the web & X"
              : webSearchEnabled
                ? "Searching the web"
                : "Searching X"
            : statusLabel,
        });

        upstreamAbort = new AbortController();
        const firstPass = await runModelPass({
          baseURL,
          apiKey,
          model: resolvedModel,
          messages: typedMessages,
          reasoningEffort,
          webSearch: webSearchEnabled,
          xSearch: xSearchEnabled,
          forceResponsesApi,
          signal: upstreamAbort.signal,
          send,
        });

        // Many OpenAI-compatible proxies accept web_search/x_search in the
        // request body but never execute them. Grok then emits a short
        // "I'll search..." prelude and completes. Detect that and run a
        // second pass that forces a full knowledge-based answer.
        //
        // Also cover the no-tools path: in-text "联网搜索" + UNAVAILABLE
        // instruction usually yields a full answer in one pass, but if the
        // model still only announces a search, continue once.
        if (
          shouldContinueAfterSearchMiss({
            webSearch: webSearchEnabled,
            xSearch: xSearchEnabled,
            toolCalls: firstPass.toolCalls,
            text: firstPass.text,
            userMessage: lastUserMessage,
          })
        ) {
          send({
            type: "status",
            label: "Search tools unavailable — completing answer",
          });
          send({
            type: "incomplete",
            reason: "search_tools_unavailable",
            message:
              "Live search tools did not run; generating a full answer from available knowledge.",
          });

          // Separate the prelude from the real answer in the visible stream.
          if (firstPass.text.trim()) {
            send({ type: "text", delta: "\n\n---\n\n" });
          }

          const continuationMessages = [
            ...typedMessages,
            ...(firstPass.text.trim()
              ? [{ role: "assistant" as const, content: firstPass.text }]
              : []),
            {
              role: "user" as const,
              content: SEARCH_CONTINUATION_INSTRUCTION,
            },
          ];

          await runModelPass({
            baseURL,
            apiKey,
            model: resolvedModel,
            messages: continuationMessages,
            reasoningEffort,
            // Second pass: do not re-advertise broken tools.
            webSearch: false,
            xSearch: false,
            forceResponsesApi,
            signal: upstreamAbort.signal,
            send,
          });
        } else if (firstPass.incompleteReason) {
          // Already forwarded via extractors; keep status informative.
          send({
            type: "status",
            label: "Incomplete response",
          });
        }

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

async function runModelPass({
  baseURL,
  apiKey,
  model,
  messages,
  reasoningEffort,
  webSearch,
  xSearch,
  forceResponsesApi,
  signal,
  send,
}: {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  reasoningEffort: "none" | "low" | "medium" | "high";
  webSearch: boolean;
  xSearch: boolean;
  forceResponsesApi?: boolean;
  signal: AbortSignal;
  send: (event: ChatStreamEvent) => void;
}): Promise<StreamPipeStats & { text: string }> {
  const modelRequest = buildModelRequest({
    baseURL,
    model,
    messages,
    reasoningEffort,
    webSearch,
    xSearch,
    forceResponsesApi,
  });

  const apiRes = await fetch(modelRequest.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(modelRequest.body),
    signal,
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    console.error("[chat] API error:", apiRes.status, errText);
    send({
      type: "error",
      message: `Model API error (${apiRes.status}): ${errText}`,
    });
    return { textChars: 0, thinkingChars: 0, toolCalls: 0, text: "" };
  }

  if (!apiRes.body) {
    send({ type: "error", message: "No response body from model" });
    return { textChars: 0, thinkingChars: 0, toolCalls: 0, text: "" };
  }

  return pipeSseEvents(
    apiRes.body,
    modelRequest.useResponsesApi,
    reasoningEffort,
    send
  );
}

async function pipeSseEvents(
  body: ReadableStream<Uint8Array>,
  useResponsesApi: boolean,
  reasoningEffort: string,
  send: (event: ChatStreamEvent) => void
): Promise<StreamPipeStats & { text: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const stats: StreamPipeStats & { text: string } = {
    textChars: 0,
    thinkingChars: 0,
    toolCalls: 0,
    text: "",
  };

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data:")) return;
    // Accept both "data: {...}" and "data:{...}".
    const payload = trimmed.startsWith("data: ")
      ? trimmed.slice(6)
      : trimmed.slice(5).trim();
    if (payload === "[DONE]") return;

    try {
      const json = JSON.parse(payload);
      const events = useResponsesApi
        ? extractResponsesApiEvents(json)
        : extractChatCompletionEvents(json);
      for (const event of events) {
        if (reasoningEffort === "none" && event.type === "thinking") continue;
        if (event.type === "text") {
          stats.text += event.delta;
          stats.textChars += event.delta.length;
        } else if (event.type === "thinking") {
          stats.thinkingChars += event.delta.length;
        } else if (event.type === "tool") {
          stats.toolCalls += 1;
        } else if (event.type === "incomplete") {
          stats.incompleteReason = event.reason;
        }
        send(event);
      }
    } catch {
      // Ignore comments and malformed upstream lines.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      handleLine(line);
    }
  }

  // Flush decoder end + any final line without a trailing newline.
  buffer += decoder.decode();
  if (buffer.trim()) {
    handleLine(buffer);
    buffer = "";
  }

  return stats;
}
