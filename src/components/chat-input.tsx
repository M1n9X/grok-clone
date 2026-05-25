"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, Square, ChevronDown, Zap, Moon, Check } from "lucide-react";
import { clsx } from "clsx";

const MODELS = [
  { id: "default", name: "Default", description: "Standard model", Icon: Zap },
  { id: "fast", name: "Fast", description: "Quick responses", Icon: Zap },
  { id: "think", name: "Think", description: "Deep reasoning", Icon: Moon },
];

interface ChatInputProps {
  onSend: (message: string) => void;
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
  const [model, setModel] = useState("default");
  const [showModels, setShowModels] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  const isEmpty = input.trim().length === 0;
  const currentModel = MODELS.find((m) => m.id === model) ?? MODELS[0]!;
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
    onSend(input.trim());
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="overflow-hidden rounded-3xl border border-border bg-input shadow-sm transition-shadow focus-within:border-input-ring">
        <div className="flex items-end gap-1 p-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="my-1.5 max-h-[200px] min-h-6 min-w-0 flex-1 resize-none bg-transparent px-2 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground"
          />

          {/* Model picker */}
          <div ref={modelRef} className="relative mb-0.5 shrink-0">
            <button
              onClick={() => setShowModels(!showModels)}
              className="flex h-9 items-center gap-2 rounded-full px-2.5 text-foreground transition-colors hover:bg-sidebar-hover"
            >
              <CurrentIcon className="h-[18px] w-[18px] shrink-0" />
              <span
                className={clsx(
                  "flex items-center gap-1 overflow-hidden transition-all duration-300",
                  isEmpty ? "max-w-32 opacity-100" : "max-w-0 opacity-0"
                )}
              >
                <span className="whitespace-nowrap text-sm font-semibold">
                  {currentModel.name}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0" />
              </span>
            </button>

            {showModels && (
              <div className="absolute bottom-full right-0 mb-2 w-60 rounded-xl border border-border bg-background p-1 shadow-lg">
                {MODELS.map(({ id, name, description, Icon }) => (
                  <button
                    key={id}
                    onClick={() => {
                      setModel(id);
                      setShowModels(false);
                    }}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-hover"
                  >
                    <span className="mt-0.5 flex h-4 w-4 items-center justify-center text-foreground">
                      {id === model ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Icon className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="flex flex-1 flex-col">
                      <span className="text-sm text-foreground">{name}</span>
                      <span className="text-xs text-muted-foreground">
                        {description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

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
