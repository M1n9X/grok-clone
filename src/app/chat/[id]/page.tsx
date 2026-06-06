"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  extractCitationsFromText,
  injectCitationLinks,
  type Citation,
} from "@/lib/chat-stream-events";
import { GrokLogo } from "@/components/grok-logo";
import { PromptSuggestions } from "@/components/prompt-suggestions";
import { TopBar } from "@/components/top-bar";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

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
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);
  const toggleSidebar = useCallback(
    () => setSidebarCollapsed((prev) => !prev),
    []
  );
  const router = useRouter();

  useKeyboardShortcuts({
    onNewChat: () => router.push("/"),
  });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const updateSessionTitle = useCallback(
    async (title: string) => {
      try {
        await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        window.dispatchEvent(new CustomEvent("sessionTitleUpdated"));
      } catch {
        // Best effort
      }
    },
    [sessionId]
  );

  const saveUserMessage = useCallback(
    async (content: string): Promise<string | null> => {
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, role: "user", content }),
        });
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (res.ok) {
          const { id } = await res.json();
          return id;
        }
        console.error("Failed to save user message:", res.status);
      } catch (err) {
        console.error("Failed to save user message:", err);
      }
      return null;
    },
    [router, sessionId]
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

      const streamState: MessageStreamState = {
        thinking: "",
        tools: [],
        citations: [],
        startedAt: streamStartedAt,
        chunks: 0,
      };

      let rafId: number | null = null;

      const flushToState = () => {
        rafId = null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: fullContent, stream: { ...streamState } }
              : m
          )
        );
      };

      const scheduleFlush = () => {
        if (rafId === null) {
          rafId = requestAnimationFrame(flushToState);
        }
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            model,
            webSearch,
            xSearch,
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login");
            return;
          }
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
                streamState.status = event.label;
                scheduleFlush();
              }

              if (event.type === "thinking") {
                eventThinking += event.delta;
                streamState.status = "Thinking";
                streamState.thinking = `${eventThinking}${taggedThinking}`;
                scheduleFlush();
              }

              if (event.type === "tool") {
                streamState.status = `Using ${event.name}`;
                streamState.tools = [...streamState.tools, event.name];
                scheduleFlush();
              }

              if (event.type === "citations") {
                streamState.citations = mergeCitations(
                  streamState.citations,
                  event.citations
                );
                scheduleFlush();
              }

              if (event.type === "text") {
                rawTextContent += event.delta;
                const hasTag =
                  rawTextContent.includes("<thinking_summary") ||
                  rawTextContent.endsWith("<") ||
                  taggedThinking !== "";
                if (hasTag) {
                  const parsed = parseTaggedThinkingSummary(rawTextContent);
                  fullContent = parsed.content;
                  taggedThinking = parsed.thinking
                    ? `${eventThinking ? "\n\n" : ""}${parsed.thinking}`
                    : "";
                  streamState.status = parsed.open
                    ? "Thinking"
                    : "Responding";
                  streamState.thinking = `${eventThinking}${taggedThinking}`;
                } else {
                  fullContent = rawTextContent;
                  streamState.status = "Responding";
                }
                streamState.firstTokenAt =
                  streamState.firstTokenAt ?? Date.now();
                streamState.chunks += 1;
                scheduleFlush();
              }

              if (event.type === "usage") {
                streamState.inputTokens = event.inputTokens;
                streamState.outputTokens = event.outputTokens;
                streamState.reasoningTokens = event.reasoningTokens;
                streamState.totalTokens = event.totalTokens;
                scheduleFlush();
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
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User cancelled
        } else {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          console.error("Chat error:", errorMessage);
          fullContent = `⚠️ ${errorMessage}`;
        }
      } finally {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }

        setIsLoading(false);
        abortRef.current = null;

        let finalCitations = streamState.citations;
        if (finalCitations.length === 0 && fullContent.trim()) {
          const textCitations = extractCitationsFromText(fullContent);
          if (textCitations.length > 0) {
            finalCitations = textCitations;
          }
        }

        const persistContent = injectCitationLinks(fullContent, finalCitations);

        streamState.citations = finalCitations;
        streamState.status = fullContent.trim()
          ? "Complete"
          : streamState.status;
        streamState.completedAt = Date.now();

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: persistContent,
                  stream: { ...streamState },
                  ...(finalCitations.length > 0
                    ? { citations: finalCitations }
                    : {}),
                }
              : m
          )
        );

        if (persistContent.trim()) {
          try {
            const saveRes = await fetch("/api/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId,
                role: "assistant",
                content: persistContent,
              }),
            });
            if (saveRes.status === 401) {
              router.push("/login");
            } else if (saveRes.ok) {
              const { id: dbId } = await saveRes.json();
              const idx = messagesRef.current.findIndex(
                (m) => m.id === assistantId
              );
              if (idx !== -1) messagesRef.current[idx]!.id = dbId;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, id: dbId } : m
                )
              );
            } else {
              console.error(
                "Failed to save assistant message:",
                saveRes.status
              );
            }
          } catch (saveErr) {
            console.error("Failed to save assistant message:", saveErr);
          }
        }
      }
    },
    [router, sessionId]
  );

  const sendMessage = useCallback(
    async (
      content: string,
      model: string = "auto",
      webSearch: boolean = false,
      xSearch: boolean = false
    ) => {
      if (!content.trim()) return;
      setIsLoading(true);
      const historySnapshot = messagesRef.current.slice();

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

      const optimisticMessages = [
        ...historySnapshot,
        userMessage,
        assistantMessage,
      ];
      setMessages(optimisticMessages);
      messagesRef.current = optimisticMessages;

      if (historySnapshot.filter((m) => m.role === "user").length === 0) {
        const title =
          content.length > 50 ? content.slice(0, 50) + "..." : content;
        updateSessionTitle(title);
      }

      const savedId = await saveUserMessage(content);
      if (!savedId) {
        const failedMessages = messagesRef.current.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Unable to save your message. Please refresh and try again.",
                stream: {
                  ...createInitialStreamState(false, false),
                  status: "Error",
                  completedAt: Date.now(),
                },
              }
            : m
        );
        setMessages(failedMessages);
        messagesRef.current = failedMessages;
        setIsLoading(false);
        return;
      }

      const savedMessages = messagesRef.current.map((m) =>
        m.id === userMessage.id ? { ...m, id: savedId } : m
      );
      setMessages(savedMessages);
      messagesRef.current = savedMessages;

      const apiMessages = [
        ...historySnapshot.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content },
      ];

      await streamResponse(apiMessages, assistantId, model, webSearch, xSearch);
    },
    [saveUserMessage, streamResponse, updateSessionTitle]
  );

  const deleteMessagesFrom = useCallback(async (messageId: string) => {
    try {
      const res = await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        console.error("Failed to delete messages:", res.status);
      }
      } catch (err) {
        console.error("Failed to delete messages:", err);
      }
  }, [router]);

  const regenerateFrom = useCallback(
    async (userIdx: number) => {
      const contextMessages = messagesRef.current.slice(0, userIdx + 1);

      const assistantId = `assistant-${Date.now()}`;
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        stream: createInitialStreamState(false, false),
      };

      const newMessages = [...contextMessages, assistantMessage];
      setMessages(newMessages);
      messagesRef.current = newMessages;

      const apiMessages = contextMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      await streamResponse(apiMessages, assistantId, "auto", false, false);
    },
    [streamResponse]
  );

  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!newContent.trim()) return;

      const idx = messagesRef.current.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      await deleteMessagesFrom(messageId);

      const savedId = await saveUserMessage(newContent);
      if (!savedId) {
        console.error(
          "Edit warning: old messages deleted but new message failed to save"
        );
      }

      messagesRef.current[idx] = {
        ...messagesRef.current[idx]!,
        content: newContent,
        id: savedId ?? messageId,
      };

      if (idx === 0) {
        const title =
          newContent.length > 50
            ? newContent.slice(0, 50) + "..."
            : newContent;
        updateSessionTitle(title);
      }

      await regenerateFrom(idx);
    },
    [deleteMessagesFrom, saveUserMessage, updateSessionTitle, regenerateFrom]
  );

  const handleRegenerate = useCallback(
    async (messageId: string) => {
      const idx = messagesRef.current.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      for (let i = idx - 1; i >= 0; i--) {
        if (messagesRef.current[i]!.role === "user") {
          const firstDiscarded = messagesRef.current[i + 1];
          if (firstDiscarded) {
            await deleteMessagesFrom(firstDiscarded.id);
          }
          await regenerateFrom(i);
          return;
        }
      }
    },
    [deleteMessagesFrom, regenerateFrom]
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function loadSession() {
      const pending = window.sessionStorage.getItem(
        `pending-msg-${sessionId}`
      );

      if (pending) {
        window.sessionStorage.removeItem(`pending-msg-${sessionId}`);
        let parsed: {
          content: string;
          model: string;
          webSearch?: boolean;
          xSearch?: boolean;
        };
        try {
          parsed = JSON.parse(pending);
        } catch {
          parsed = { content: pending, model: "auto" };
        }
        sendMessage(
          parsed.content,
          parsed.model,
          parsed.webSearch ?? false,
          parsed.xSearch ?? false
        );
        return;
      }

      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.ok) {
          const { messages: dbMessages } = await res.json();
          const loaded = dbMessages.map(
            (m: { id: string; role: string; content: string }) => {
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
            }
          );
          setMessages(loaded);
          messagesRef.current = loaded;
        }
      } catch {
        // ignore
      }
    }

    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleNewChat = useCallback(() => router.push("/"), [router]);

  return (
    <div className="flex h-full min-w-0">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={closeMobileSidebar}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onNewChat={handleNewChat} />
        <header className="flex h-14 shrink-0 items-center justify-between px-3 pt-[env(safe-area-inset-top)] md:hidden">
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
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full flex-col items-center justify-start py-6 sm:justify-center">
              <GrokLogo className="mb-8 hidden h-12 w-auto text-foreground md:block" />
              <ChatInput
                onSend={sendMessage}
                isLoading={isLoading}
                onStop={handleStop}
              />
              <p className="mt-3 px-4 text-center text-xs text-muted-foreground">
                Grok can make mistakes. Verify important information.
              </p>
              <PromptSuggestions
                onSelect={(text, options) =>
                  sendMessage(
                    text,
                    options?.model ?? "auto",
                    options?.webSearch ?? false,
                    options?.xSearch ?? false
                  )
                }
              />
            </div>
          </div>
        ) : (
          <>
            <ChatMessages
              messages={messages}
              isStreaming={isLoading}
              onEdit={handleEditMessage}
              onRegenerate={handleRegenerate}
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
    citations: [],
    startedAt: Date.now(),
    chunks: 0,
  };
}

function mergeCitations(
  existing: Citation[],
  incoming: Citation[]
): Citation[] {
  const seen = new Set(existing.map((c) => c.url));
  const merged = [...existing];
  for (const c of incoming) {
    if (!seen.has(c.url)) {
      merged.push({ ...c, index: merged.length + 1 });
      seen.add(c.url);
    }
  }
  return merged;
}
