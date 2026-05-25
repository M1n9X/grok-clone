"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowUp,
  Square,
  ChevronDown,
  Zap,
  Brain,
  Sparkles,
  Check,
} from "lucide-react";
import { clsx } from "clsx";

export const MODELS = [
  {
    id: "fast",
    name: "Fast",
    description: "Quick responses for everyday tasks",
    Icon: Zap,
  },
  {
    id: "auto",
    name: "Auto",
    description: "Automatically picks the best model",
    Icon: Sparkles,
  },
  {
    id: "expert",
    name: "Expert",
    description: "Deep reasoning for complex problems",
    Icon: Brain,
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

interface ChatInputProps {
  onSend: (message: string, model: string) => void;
  isLoading: boolean;
  onStop: () => void;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  isLoading,
  onStop,
  placeholder = "What do you want to know?",
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelId>("auto");
  const [showModels, setShowModels] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  const isEmpty = input.trim().length === 0;
  const currentModel = MODELS.find((m) => m.id === model) ?? MODELS[1]!;
  const CurrentIcon = currentModel.Icon;

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Close model picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setShowModels(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSubmit() {
    if (isEmpty || isLoading) return;
    onSend(input.trim(), model);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-3xl px-4">
      {/* Model picker dropdown — rendered OUTSIDE overflow-hidden container */}
      {showModels && (
        <>
          {/* Backdrop to close on click */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowModels(false)}
          />
          <div className="absolute bottom-full left-1/2 z-50 mb-3 w-64 -translate-x-1/2 rounded-xl border border-border bg-background p-1 shadow-xl">
            {MODELS.map(({ id, name, description, Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setModel(id);
                  setShowModels(false);
                }}
                className={clsx(
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-sidebar-hover",
                  id === model && "bg-accent"
                )}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {id === model ? (
                    <Check className="h-4 w-4 text-foreground" />
                  ) : (
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="rounded-3xl border border-border bg-input shadow-sm transition-shadow focus-within:border-input-ring">
        {/* Model selector bar — above textarea, always visible */}
        <div className="flex items-center px-3 pt-2.5" ref={modelRef}>
          <button
            onClick={() => setShowModels(!showModels)}
            className={clsx(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium transition-colors",
              showModels
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
            )}
          >
            <CurrentIcon className="h-4 w-4 shrink-0" />
            <span>{currentModel.name}</span>
            <ChevronDown
              className={clsx(
                "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                showModels && "rotate-180"
              )}
            />
          </button>
        </div>

        {/* Textarea + send button row */}
        <div className="flex items-end gap-1 p-2 pt-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="my-1.5 max-h-[200px] min-h-6 min-w-0 flex-1 resize-none bg-transparent px-2 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground"
          />

          {/* Send / Stop button */}
          <div className="relative mb-0.5 h-9 w-9 shrink-0">
            {!isLoading && (
              <button
                onClick={handleSubmit}
                disabled={isEmpty}
                className={clsx(
                  "absolute inset-0 flex items-center justify-center rounded-full transition-all duration-300",
                  isEmpty
                    ? "bg-muted text-muted-foreground"
                    : "bg-foreground text-background hover:opacity-90"
                )}
              >
                <ArrowUp className="h-[18px] w-[18px]" />
              </button>
            )}
            {isLoading && (
              <button
                onClick={onStop}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground text-background transition-all duration-300 hover:opacity-90"
              >
                <Square className="h-3.5 w-3.5" fill="currentColor" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
