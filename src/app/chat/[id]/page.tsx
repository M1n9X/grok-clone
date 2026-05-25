"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { ChatInput } from "@/components/chat-input";
import {
  ChatMessages,
  type Message,
  type MessageStreamState,
} from "@/components/chat-messages";
import {
  decodeStreamEventLine,
  parseTaggedThinkingSummary,
} from "@/lib/chat-stream-events";
import { GrokLogo } from "@/components/grok-logo";

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const pendingMsgRef = useRef<{
    content: string;
    model: string;
    webSearch?: boolean;
    xSearch?: boolean;
  } | null>(null);
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

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
    async (
      apiMessages: { role: string; content: string }[],
      assistantId: string,
      model: string,
      webSearch: boolean,
      xSearch: boolean
    ) => {
      setIsLoading(true);
      const abortController = new AbortController();
      abortRef.current = abortController;

      let fullContent = "";
      let rawTextContent = "";
      let eventThinking = "";
      let taggedThinking = "";
      let lineBuffer = "";
      const streamStartedAt = Date.now();
      const updateStream = (updater: (stream: MessageStreamState) => MessageStreamState) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  stream: updater(
                    m.stream ?? {
                      thinking: "",
                      tools: [],
                      startedAt: streamStartedAt,
                      chunks: 0,
                    }
                  ),
                }
              : m
          )
        );
      };
      const updateContent = () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullContent } : m
          )
        );
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            sessionId,
            model,
            webSearch,
            xSearch,
          }),
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

            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop() ?? "";

            for (const line of lines) {
              const event = decodeStreamEventLine(line);
              if (!event) continue;

              if (event.type === "status") {
                updateStream((stream) => ({ ...stream, status: event.label }));
              }

              if (event.type === "thinking") {
                eventThinking += event.delta;
                updateStream((stream) => ({
                  ...stream,
                  status: "Thinking",
                  thinking: `${eventThinking}${taggedThinking}`,
                }));
              }

              if (event.type === "tool") {
                updateStream((stream) => ({
                  ...stream,
                  status: `Using ${event.name}`,
                  tools: [...stream.tools, event.name],
                }));
              }

              if (event.type === "text") {
                rawTextContent += event.delta;
                const parsed = parseTaggedThinkingSummary(rawTextContent);
                fullContent = parsed.content;
                taggedThinking = parsed.thinking
                  ? `${eventThinking ? "\n\n" : ""}${parsed.thinking}`
                  : "";
                const now = Date.now();
                updateStream((stream) => ({
                  ...stream,
                  status: parsed.open ? "Thinking" : "Responding",
                  thinking: `${eventThinking}${taggedThinking}`,
                  firstTokenAt: stream.firstTokenAt ?? now,
                  chunks: stream.chunks + 1,
                }));
                updateContent();
              }

              if (event.type === "usage") {
                updateStream((stream) => ({
                  ...stream,
                  inputTokens: event.inputTokens,
                  outputTokens: event.outputTokens,
                  reasoningTokens: event.reasoningTokens,
                  totalTokens: event.totalTokens,
                }));
              }

              if (event.type === "error") {
                throw new Error(event.message);
              }
            }
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
        updateStream((stream) => ({
          ...stream,
          status: fullContent.trim() ? "Complete" : stream.status,
          completedAt: Date.now(),
        }));

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

  async function sendMessage(
    content: string,
    model: string = "auto",
    webSearch: boolean = false,
    xSearch: boolean = false
  ) {
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
      stream: createInitialStreamState(webSearch, xSearch),
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

    await streamResponse(apiMessages, assistantId, model, webSearch, xSearch);
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
      stream: createInitialStreamState(false, false),
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

    await streamResponse(apiMessages, assistantId, "auto", false, false);
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
        setTimeout(
          () =>
            sendMessage(
              pending.content,
              pending.model,
              pending.webSearch ?? false,
              pending.xSearch ?? false
            ),
          100
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  function handleStop() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex h-full min-w-0">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={closeMobileSidebar}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between px-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open sidebar"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
          <GrokLogo className="h-6 w-auto text-foreground" />
          <div className="h-10 w-10" />
        </header>

        {messages.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center pb-6">
            <GrokLogo className="mb-8 hidden h-12 w-auto text-foreground md:block" />
            <ChatInput
              onSend={sendMessage}
              isLoading={isLoading}
              onStop={handleStop}
            />
            <p className="mt-3 px-4 text-center text-xs text-muted-foreground">
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
            <div className="shrink-0 pb-3">
              <ChatInput
                onSend={sendMessage}
                isLoading={isLoading}
                onStop={handleStop}
              />
              <p className="mt-2 px-4 text-center text-xs text-muted-foreground">
                Grok can make mistakes. Verify important information.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function createInitialStreamState(
  webSearch: boolean,
  xSearch: boolean
): MessageStreamState {
  return {
    status:
      webSearch || xSearch ? "Preparing search" : "Preparing response",
    thinking: "",
    tools: [],
    startedAt: Date.now(),
    chunks: 0,
  };
}
