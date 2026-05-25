import { createClient } from "@/lib/supabase/server";
import {
  buildModelRequest,
  encodeStreamEvent,
  extractChatCompletionEvents,
  extractResponsesApiEvents,
  type ChatStreamEvent,
} from "@/lib/chat-stream-events";

export const maxDuration = 60;

const MODEL_CONFIG: Record<
  string,
  { model: string; reasoningEffort: "none" | "low" | "medium" | "high" }
> = {
  fast: {
    model: process.env.OPENAI_MODEL_FAST ?? "grok-4.3",
    reasoningEffort: "none",
  },
  auto: {
    model: process.env.OPENAI_MODEL_AUTO ?? "grok-4.3",
    reasoningEffort: "low",
  },
  expert: {
    model: process.env.OPENAI_MODEL_EXPERT ?? "grok-4.3",
    reasoningEffort: "high",
  },
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const { messages, sessionId, model, webSearch, xSearch } = await req.json();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Invalid messages" }, { status: 400 });
  }

  const selectedConfig = MODEL_CONFIG[model] ?? MODEL_CONFIG.auto!;
  const resolvedModel =
    typeof model === "string" && !MODEL_CONFIG[model]
      ? model
      : selectedConfig.model;
  const reasoningEffort = selectedConfig.reasoningEffort;
  const baseURL = (
    process.env.OPENAI_API_BASE_URL ?? "https://api.x.ai/v1"
  ).replace(/\/$/, "");
  const apiKey = process.env.OPENAI_API_KEY || process.env.XAI_API_KEY || "";
  const forceResponsesApi =
    process.env.GROK_USE_RESPONSES_API === "false" ? false : undefined;

  const typedMessages = messages.map(
    (m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })
  );

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
        send({ type: "status", label: "Preparing response" });

        // Save user message inside the stream so the browser receives status
        // immediately instead of waiting behind database and model latency.
        const lastUserMessage = typedMessages
          .filter((m: { role: string }) => m.role === "user")
          .pop();
        if (lastUserMessage && sessionId) {
          await supabase.from("chat_messages").insert({
            session_id: sessionId,
            user_id: userId,
            role: "user",
            content: lastUserMessage.content,
          });
        }

        send({
          type: "status",
          label:
            reasoningEffort === "none"
              ? "Starting fast response"
              : "Thinking",
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

        await pipeSseEvents(apiRes.body, modelRequest.useResponsesApi, send);
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

async function pipeSseEvents(
  body: ReadableStream<Uint8Array>,
  useResponsesApi: boolean,
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
        for (const event of events) send(event);
      } catch {
        // Ignore comments and malformed upstream lines.
      }
    }
  }
}
