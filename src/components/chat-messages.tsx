"use client";

import {
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  if (messages.length === 0) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pt-16 pb-4">
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
  const [editContent, setEditContent] = useState(message.content);

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleEditSave() {
    onEdit?.(message.id, editContent);
    setEditing(false);
  }

  const isUser = message.role === "user";

  return (
    <div className="group/message relative mb-4 flex flex-col">
      {isUser ? (
        <div className="flex flex-col items-end">
          {editing ? (
            <div className="max-w-[90%] space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-w-[300px] rounded-2xl border border-border bg-input px-4 py-3 text-sm text-foreground outline-none focus:border-input-ring"
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* User message actions */}
          {!editing && (
            <div className="mt-1 flex h-8 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100">
              <button
                onClick={() => {
                  setEditContent(message.content);
                  setEditing(true);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={handleCopy}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
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
            <div className="prose-chat text-sm text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-foreground" />
              )}
            </div>
          </div>

          {/* Assistant message actions */}
          <div className="-ml-2 mt-1 flex h-8 items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100">
            <button
              onClick={() => onRegenerate?.(message.id)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={handleCopy}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
            <button className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground">
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground">
              <ThumbsDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
