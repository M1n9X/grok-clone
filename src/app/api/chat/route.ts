import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

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

  const selectedModel = model || process.env.OPENAI_MODEL || "gpt-4o";

  const typedMessages = messages.map(
    (m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })
  );

  const result = streamText({
    model: provider(selectedModel),
    messages: typedMessages,
  });

  // Save user message to DB
  const lastUserMessage = typedMessages.filter((m) => m.role === "user").pop();
  if (lastUserMessage && sessionId) {
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      user_id: user.id,
      role: "user",
      content: lastUserMessage.content,
    });
  }

  // Save assistant message after stream completes (fire-and-forget)
  result.text.then(async (fullText) => {
    if (sessionId && fullText) {
      try {
        await supabase.from("chat_messages").insert({
          session_id: sessionId,
          user_id: user.id,
          role: "assistant",
          content: fullText,
        });
      } catch {
        // Best effort save
      }
    }
  });

  return result.toTextStreamResponse();
}
