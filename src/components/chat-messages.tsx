"use client";

import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Pencil,
  ChevronDown,
  Brain,
  Search,
  ArrowDown,
  X,
  ExternalLink,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { useToast } from "@/components/toast";
import type { Citation } from "@/lib/chat-stream-events";

export interface MessageStreamState {
  status?: string;
  thinking: string;
  tools: string[];
  citations: Citation[];
  startedAt?: number;
  firstTokenAt?: number;
  completedAt?: number;
  chunks: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  stream?: MessageStreamState;
  citations?: Citation[];
}

interface ChatMessagesProps {
  messages: Message[];
  isStreaming: boolean;
  onEdit?: (id: string, content: string) => void;
  onRegenerate?: (id: string) => void;
}

export function ChatMessages({
  messages,
  isStreaming,
  onEdit,
  onRegenerate,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const isAutoScrolling = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = distanceFromBottom < 150;
    setShowScrollBtn(!isNearBottom);
    isAutoScrolling.current = isNearBottom;
  }, []);

  useEffect(() => {
    if (isAutoScrolling.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    isAutoScrolling.current = true;
  }, [messages.length]);

  function scrollToBottom() {
    isAutoScrolling.current = true;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollBtn(false);
  }

  if (messages.length === 0) return null;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl px-3 pt-6 pb-4 sm:px-4 md:pt-16">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isStreaming={
                isStreaming && message === messages[messages.length - 1]
              }
              onEdit={onEdit}
              onRegenerate={onRegenerate}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {showScrollBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background shadow-lg transition-all hover:bg-muted"
        >
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

function ChatMessage({
  message,
  isStreaming,
  onEdit,
  onRegenerate,
}: {
  message: Message;
  isStreaming: boolean;
  onEdit?: (id: string, content: string) => void;
  onRegenerate?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const [editContent, setEditContent] = useState(message.content);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { toast } = useToast();

  const citations = message.citations ?? message.stream?.citations ?? [];

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    toast("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleEditSave() {
    onEdit?.(message.id, editContent);
    setEditing(false);
  }

  const isUser = message.role === "user";

  return (
    <div className="group/message relative mb-4 flex min-w-0 flex-col">
      {isUser ? (
        <div className="flex flex-col items-end">
          {editing ? (
            <div className="w-full max-w-[90%] space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-w-0 rounded-2xl border border-border bg-input px-4 py-3 text-sm text-foreground outline-none focus:border-input-ring"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-lg px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  className="rounded-lg bg-foreground px-3 py-1 text-xs text-background"
                >
                  Save & Submit
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-[90%] rounded-3xl rounded-br-lg border border-border bg-user-bubble px-4 py-3 text-user-bubble-foreground">
              <div className="prose-chat text-sm">
                <MarkdownRenderer>{message.content}</MarkdownRenderer>
              </div>
            </div>
          )}

          {/* User message actions */}
          {!editing && (
            <div className="mt-1 flex h-8 items-center justify-end gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/message:opacity-100">
              <button
                onClick={() => {
                  setEditContent(message.content);
                  setEditing(true);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground md:h-8 md:w-8"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={handleCopy}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground md:h-8 md:w-8"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-start">
          <div className="w-full">
            {message.stream && (
              <ThinkingPanel
                stream={message.stream}
                isStreaming={isStreaming}
                open={thinkingOpen}
                onToggle={() => setThinkingOpen((value) => !value)}
              />
            )}
            <div className="prose-chat min-w-0 text-sm text-foreground">
              <MarkdownRenderer citations={citations}>
                {message.content}
              </MarkdownRenderer>
              {isStreaming && message.content.length > 0 && (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-foreground" />
              )}
            </div>
            {isStreaming && message.content.length === 0 && (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="h-2 w-2 animate-pulse rounded-full bg-foreground" />
                <span>{message.stream?.status ?? "Thinking"}</span>
              </div>
            )}
          </div>

          {/* Assistant message actions */}
          <div className="-ml-2 mt-1 flex h-8 max-w-full items-center gap-1 overflow-x-auto opacity-100 transition-opacity md:opacity-0 md:group-hover/message:opacity-100">
            <button
              onClick={() => onRegenerate?.(message.id)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground md:h-8 md:w-8"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={handleCopy}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground md:h-8 md:w-8"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
            <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground md:h-8 md:w-8">
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground md:h-8 md:w-8">
              <ThumbsDown className="h-4 w-4" />
            </button>
            {citations.length > 0 && (
              <button
                onClick={() => setDrawerOpen(true)}
                className="ml-1 flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
              >
                <Search className="h-3.5 w-3.5" />
                <span>References</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                  {citations.length}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {drawerOpen && (
        <CitationDrawer
          citations={citations}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

function ThinkingPanel({
  stream,
  isStreaming,
  open,
  onToggle,
}: {
  stream: MessageStreamState;
  isStreaming: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const [now, setNow] = useState<number | null>(null);
  const hasThinking = stream.thinking.trim().length > 0;
  const hasReasoningUsage =
    stream.reasoningTokens !== undefined && stream.reasoningTokens > 0;
  const currentEnd = stream.completedAt ?? now;
  const elapsedMs =
    currentEnd !== null && currentEnd !== undefined && stream.startedAt
      ? currentEnd - stream.startedAt
      : undefined;
  const firstTokenMs =
    stream.firstTokenAt && stream.startedAt
      ? stream.firstTokenAt - stream.startedAt
      : undefined;

  const isWaitingForFirstToken = isStreaming && firstTokenMs === undefined;

  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [isStreaming]);

  if (!isStreaming && !hasThinking && stream.tools.length === 0 && !firstTokenMs) {
    return null;
  }

  return (
    <div className="mb-3 min-w-0 rounded-xl border border-border bg-accent/70">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
          {isWaitingForFirstToken ? (
            <span className="relative flex h-4 w-4 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
              <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/20">
                <Brain className="h-3 w-3 text-primary" />
              </span>
            </span>
          ) : (
            <Brain className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">
            {stream.status ?? (isStreaming ? "Thinking" : "Thought process")}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground sm:gap-2">
          {firstTokenMs !== undefined && (
            <span className="font-mono tabular-nums">
              first {formatDuration(firstTokenMs)}
            </span>
          )}
          {elapsedMs !== undefined && (
            <span className={`font-mono tabular-nums ${isWaitingForFirstToken ? "text-primary" : ""}`}>
              {formatDuration(elapsedMs)}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2">
          {stream.tools.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {stream.tools.map((tool, index) => (
                <span
                  key={`${tool}-${index}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <Search className="h-3 w-3" />
                  {tool}
                </span>
              ))}
            </div>
          )}

          {hasThinking ? (
            <div className="max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
              {stream.thinking}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {isStreaming
                ? isWaitingForFirstToken
                  ? "Model is analyzing your question... Complex queries may take 20-30 seconds."
                  : "Generating response..."
                : hasReasoningUsage
                  ? "Reasoning tokens were used, but this provider did not stream a reasoning summary."
                  : "No reasoning summary was returned for this response."}
            </div>
          )}

          {(stream.reasoningTokens ?? stream.totalTokens) !== undefined && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {stream.reasoningTokens !== undefined && (
                <span>reasoning {stream.reasoningTokens}</span>
              )}
              {stream.outputTokens !== undefined && (
                <span>output {stream.outputTokens}</span>
              )}
              {stream.totalTokens !== undefined && (
                <span>total {stream.totalTokens}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function CitationDrawer({
  citations,
  onClose,
}: {
  citations: Citation[];
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    document.body.classList.add("drawer-open");
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.classList.remove("drawer-open");
    };
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-background shadow-2xl animate-drawer-in sm:max-w-sm">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              References
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {citations.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-2">
            {citations.map((citation, i) => (
              <a
                key={`${citation.url}-${i}`}
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group/cite flex gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted"
              >
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
                  {citation.index}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${citation.domain}&sz=32`}
                      alt=""
                      className="h-3.5 w-3.5 rounded-sm"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <span className="truncate text-xs text-muted-foreground">
                      {citation.domain}
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover/cite:text-primary">
                    {citation.title}
                  </div>
                  {citation.description && (
                    <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {citation.description}
                    </div>
                  )}
                </div>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/cite:opacity-100" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
