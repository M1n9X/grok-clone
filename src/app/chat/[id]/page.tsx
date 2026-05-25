"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

  // Auto-generate session title from first user message
  const updateSessionTitle = useCallback(
    async (title: string) => {
      try {
        await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        // Trigger sidebar refresh to show new title
        window.dispatchEvent(new CustomEvent("sessionTitleUpdated"));
      } catch {
        // Best effort
      }
    },
    [sessionId]
  );

  const streamResponse = useCallback(
    async (apiMessages: { role: string; content: string }[], assistantId: string) => {
      setIsLoading(true);
      const abortController = new AbortController();
      abortRef.current = abortController;

      let fullContent = "";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, sessionId }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          let errorMsg = `Request failed (${res.status})`;
          try {
            const errData = await res.json();
            if (errData.error) errorMsg = errData.error;
          } catch {
            const text = await res.text();
            if (text) errorMsg = text;
          }
          throw new Error(errorMsg);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            fullContent += decoder.decode(value, { stream: true });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: fullContent } : m
              )
            );
          }
        }

        if (!fullContent.trim()) {
          fullContent =
            "⚠️ No response received. The model may be temporarily unavailable.";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: fullContent } : m
            )
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User cancelled
        } else {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          console.error("Chat error:", errorMessage);
          fullContent = `⚠️ ${errorMessage}`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: fullContent } : m
            )
          );
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;

        // Save assistant message after stream completes
        if (fullContent.trim()) {
          fetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              role: "assistant",
              content: fullContent,
            }),
          }).catch((err) => {
            console.error("Failed to save assistant message:", err);
          });
        }
      }
    },
    [sessionId]
  );

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

    // Auto-generate title from first user message
    if (messagesRef.current.filter((m) => m.role === "user").length === 0) {
      const title =
        content.length > 50 ? content.slice(0, 50) + "..." : content;
      updateSessionTitle(title);
    }

    const apiMessages = [...messagesRef.current, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    await streamResponse(apiMessages, assistantId);
  }

  // Edit user message: replace content, discard subsequent messages, re-generate
  async function handleEditMessage(messageId: string, newContent: string) {
    if (!newContent.trim()) return;

    const idx = messagesRef.current.findIndex((m) => m.id === messageId);
    if (idx === -1) return;

    // Keep messages up to and including the edited one, discard the rest
    const keptMessages = messagesRef.current.slice(0, idx);
    const editedUserMessage: Message = {
      ...messagesRef.current[idx]!,
      content: newContent,
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    const newMessages = [...keptMessages, editedUserMessage, assistantMessage];
    setMessages(newMessages);
    messagesRef.current = newMessages;

    // Update title if this is the first message
    if (idx === 0) {
      const title =
        newContent.length > 50 ? newContent.slice(0, 50) + "..." : newContent;
      updateSessionTitle(title);
    }

    const apiMessages = [...keptMessages, editedUserMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    await streamResponse(apiMessages, assistantId);
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
      const pending = window.sessionStorage.getItem(
        `pending-msg-${sessionId}`
      );
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
            <ChatMessages
              messages={messages}
              isStreaming={isLoading}
              onEdit={handleEditMessage}
            />
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
