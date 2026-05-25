import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// Model ID -> env variable mapping
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
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, sessionId, model } = await req.json();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Invalid messages", { status: 400 });
  }

  const provider = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "",
    baseURL: process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1",
  });

  // Resolve model: use MODEL_MAP for known IDs, otherwise use as-is
  const resolvedModel = MODEL_MAP[model] ?? model ?? MODEL_MAP.auto!;

  const typedMessages = messages.map(
    (m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })
  );

  // Save user message before streaming
  const lastUserMessage = typedMessages.filter((m) => m.role === "user").pop();
  if (lastUserMessage && sessionId) {
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      user_id: user.id,
      role: "user",
      content: lastUserMessage.content,
    });
  }

  const result = streamText({
    model: provider(resolvedModel),
    messages: typedMessages,
    onError: ({ error }) => {
      console.error("[chat] stream error:", error);
    },
    onFinish: async ({ text }) => {
      if (sessionId && text) {
        try {
          const serverSupabase = await createClient();
          await serverSupabase.from("chat_messages").insert({
            session_id: sessionId,
            user_id: user.id,
            role: "assistant",
            content: text,
          });
        } catch {
          // Best effort save
        }
      }
    },
  });

  return result.toTextStreamResponse();
}
