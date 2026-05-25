"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { ChatInput } from "@/components/chat-input";
import { ChatMessages, type Message } from "@/components/chat-messages";

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const pendingMsgRef = useRef<{ content: string; model: string } | null>(null);

  // Keep ref in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  async function sendMessage(content: string, model: string = "auto") {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const apiMessages = [...messagesRef.current, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, sessionId, model }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Request failed (${res.status})`);
      }

      // Read plain text stream from toTextStreamResponse
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          // Detect error chunks from the stream
          if (chunk.startsWith('{"error":')) {
            try {
              const errData = JSON.parse(chunk);
              throw new Error(errData.error?.message ?? "Stream error");
            } catch (e) {
              if (e instanceof SyntaxError) {
                // Not JSON, treat as normal text
                fullContent += chunk;
              } else {
                throw e; // Re-throw our Error
              }
            }
          } else {
            fullContent += chunk;
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: fullContent } : m
            )
          );
        }
      }

      // If no content was streamed, show error
      if (!fullContent.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "⚠️ No response received. The model may be temporarily unavailable." }
              : m
          )
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — keep partial content
      } else {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        console.error("Chat error:", errorMessage);
        // Show error in the assistant bubble
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `⚠️ ${errorMessage}` }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  // Load existing messages on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function loadSession() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.ok) {
          const { messages: dbMessages } = await res.json();
          const loaded = dbMessages.map(
            (m: { id: string; role: string; content: string }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
            })
          );
          setMessages(loaded);
          messagesRef.current = loaded;
        }
      } catch {
        // ignore
      }

      // Check for pending message from home page
      const pending = window.sessionStorage.getItem(`pending-msg-${sessionId}`);
      if (pending) {
        window.sessionStorage.removeItem(`pending-msg-${sessionId}`);
        try {
          pendingMsgRef.current = JSON.parse(pending);
        } catch {
          pendingMsgRef.current = { content: pending, model: "auto" };
        }
      }
    }

    loadSession();
  }, [sessionId]);

  // Send pending message after load
  useEffect(() => {
    if (pendingMsgRef.current && messages.length >= 0) {
      const pending = pendingMsgRef.current;
      pendingMsgRef.current = null;
      if (pending) {
        setTimeout(() => sendMessage(pending.content, pending.model), 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  function handleStop() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex h-full">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="mb-8">
              <svg
                className="mx-auto h-12 w-12 text-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <ChatInput
              onSend={sendMessage}
              isLoading={isLoading}
              onStop={handleStop}
            />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Grok can make mistakes. Verify important information.
            </p>
          </div>
        ) : (
          <>
            <ChatMessages messages={messages} isStreaming={isLoading} />
            <div className="pb-3">
              <ChatInput
                onSend={sendMessage}
                isLoading={isLoading}
                onStop={handleStop}
              />
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Grok can make mistakes. Verify important information.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
