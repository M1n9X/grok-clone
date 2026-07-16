import { getSessionWithMessages } from "@/lib/db/queries";
import { extractCitationsFromText } from "@/lib/chat-stream-events";
import ChatPageClient from "./chat-page-client";
import type { Message } from "@/components/chat-messages";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;

  // Never notFound() here: the home page navigates optimistically with a
  // client-generated UUID before the session row exists (pending-msg-*).
  // Fail open on transient DB errors so the client can still recover via
  // pending-msg or a follow-up API fetch (matches previous client behavior).
  let dbMessages: Awaited<
    ReturnType<typeof getSessionWithMessages>
  >["messages"] = [];
  try {
    const result = await getSessionWithMessages(sessionId);
    dbMessages = result.messages;
  } catch {
    dbMessages = [];
  }

  const initialMessages: Message[] = dbMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const base: Message = {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      };
      if (m.role === "assistant") {
        const citations = extractCitationsFromText(m.content);
        if (citations.length > 0) {
          base.citations = citations;
        }
      }
      return base;
    });

  // key forces a clean client state when switching sessions so we never
  // leak the previous conversation's in-flight stream into the next one.
  return (
    <ChatPageClient
      key={sessionId}
      sessionId={sessionId}
      initialMessages={initialMessages}
    />
  );
}
