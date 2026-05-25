import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MODEL_MAP: Record<string, string> = {
  fast: process.env.OPENAI_MODEL_FAST ?? "grok-4.20-fast",
  auto: process.env.OPENAI_MODEL_AUTO ?? "grok-4.20-auto",
  expert: process.env.OPENAI_MODEL_EXPERT ?? "grok-4.20-expert",
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
  const { messages, sessionId, model } = await req.json();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Invalid messages" }, { status: 400 });
  }

  const resolvedModel = MODEL_MAP[model] ?? model ?? MODEL_MAP.auto!;
  const baseURL = (
    process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const apiKey = process.env.OPENAI_API_KEY ?? "";

  const typedMessages = messages.map(
    (m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })
  );

  // Save user message before streaming
  const lastUserMessage = typedMessages.filter((m) => m.role === "user").pop();
  if (lastUserMessage && sessionId) {
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      user_id: userId,
      role: "user",
      content: lastUserMessage.content,
    });
  }

  // Direct fetch to the OpenAI-compatible API
  const apiRes = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages: typedMessages,
      stream: true,
    }),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    console.error("[chat] API error:", apiRes.status, errText);
    return Response.json(
      { error: `Model API error (${apiRes.status}): ${errText}` },
      { status: 502 }
    );
  }

  if (!apiRes.body) {
    return Response.json({ error: "No response body from model" }, { status: 502 });
  }

  // Parse SSE → extract text deltas → output as plain text stream
  // Assistant message will be saved by the client after stream completes
  const upstream = apiRes.body;
  const sseReader = upstream.getReader();
  const sseDecoder = new TextDecoder();
  const encoder = new TextEncoder();
  let sseBuffer = "";

  const outputStream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await sseReader.read();

        if (done) {
          controller.close();
          return;
        }

        sseBuffer += sseDecoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const payload = trimmed.slice(6);
          if (payload === "[DONE]") {
            controller.close();
            return;
          }

          try {
            const json = JSON.parse(payload);

            // Error in SSE chunk
            if (json.error) {
              const errMsg =
                typeof json.error === "string"
                  ? json.error
                  : json.error.message ?? "Stream error";
              const errText = `\n⚠️ ${errMsg}`;
              controller.enqueue(encoder.encode(errText));
              controller.close();
              return;
            }

            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(delta));
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      } catch (err) {
        console.error("[chat] stream error:", err);
        controller.close();
      }
    },
    cancel() {
      sseReader.cancel();
    },
  });

  return new Response(outputStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
