"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChatInput } from "@/components/chat-input";
import { GrokLogo } from "@/components/grok-logo";
import { PromptSuggestions } from "@/components/prompt-suggestions";

export default function HomePage() {
  const router = useRouter();

  // Optimistic send: generate the session id on the client and navigate
  // immediately; the session row is created lazily by POST /api/messages.
  const handleSend = useCallback(
    (
      content: string,
      model: string = "auto",
      webSearch: boolean = false,
      xSearch: boolean = false
    ) => {
      const sessionId = crypto.randomUUID();
      const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
      window.sessionStorage.setItem(
        `pending-msg-${sessionId}`,
        JSON.stringify({ content, model, webSearch, xSearch })
      );
      window.dispatchEvent(
        new CustomEvent("session-upsert", {
          detail: { id: sessionId, title },
        })
      );
      router.push(`/chat/${sessionId}`);
    },
    [router]
  );

  const handleStop = useCallback(() => {}, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-0">
      <div className="mx-auto flex min-h-full w-full flex-col items-center justify-start py-6 sm:justify-center">
        <GrokLogo className="mb-8 hidden h-12 w-auto text-foreground md:block" />

        <ChatInput onSend={handleSend} isLoading={false} onStop={handleStop} />

        <p className="mt-3 px-4 text-center text-xs text-muted-foreground">
          Grok can make mistakes. Verify important information.
        </p>

        <PromptSuggestions
          onSelect={(text, options) =>
            handleSend(
              text,
              options?.model ?? "auto",
              options?.webSearch ?? false,
              options?.xSearch ?? false
            )
          }
        />
      </div>
    </div>
  );
}
