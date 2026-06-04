"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  Square,
  ChevronDown,
  Zap,
  Brain,
  Sparkles,
  Check,
  Search,
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
  onSend: (
    message: string,
    model: string,
    webSearch: boolean,
    xSearch: boolean
  ) => void;
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
  const [webSearch, setWebSearch] = useState(false);
  const [xSearch, setXSearch] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);

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

  // Position dropdown when opening
  useEffect(() => {
    if (showModels && pickerBtnRef.current) {
      const rect = pickerBtnRef.current.getBoundingClientRect();
      setDropdownPos({
        top: Math.max(12, rect.top - 8),
        right: Math.max(12, window.innerWidth - rect.right),
      });
    }
  }, [showModels]);

  // Close on outside click
  useEffect(() => {
    if (!showModels) return;
    function handleClick() {
      setShowModels(false);
    }
    // Delay to avoid the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
    };
  }, [showModels]);

  function handleSubmit() {
    if (isEmpty || isLoading) return;
    onSend(input.trim(), model, webSearch, xSearch);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className="overflow-hidden rounded-[1.75rem] border border-border bg-input shadow-sm transition-shadow focus-within:border-input-ring sm:rounded-3xl">
        <div className="flex flex-wrap items-end gap-1 p-2 sm:flex-nowrap">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="order-1 my-1.5 max-h-[40dvh] min-h-6 min-w-0 basis-full resize-none bg-transparent px-2 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground sm:order-none sm:max-h-[200px] sm:flex-1 sm:basis-auto"
          />

          <button
            type="button"
            onClick={() => setWebSearch((value) => !value)}
            aria-pressed={webSearch}
            className={clsx(
              "order-2 mb-0.5 flex h-9 shrink-0 items-center gap-2 rounded-full px-2.5 text-sm transition-colors sm:order-none",
              webSearch
                ? "bg-foreground text-background"
                : "text-foreground hover:bg-sidebar-hover"
            )}
          >
            <Search className="h-[17px] w-[17px] shrink-0" />
            <span
              className={clsx(
                "overflow-hidden whitespace-nowrap transition-all duration-300",
                isEmpty ? "max-w-20 opacity-100" : "max-w-0 opacity-0"
              )}
            >
              Search
            </span>
          </button>

          {/* Model picker — inline, matches Grok original */}
          <button
            ref={pickerBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowModels(!showModels);
            }}
            className="order-2 mb-0.5 flex h-9 min-w-0 shrink-0 items-center gap-2 rounded-full px-2.5 text-foreground transition-colors hover:bg-sidebar-hover sm:order-none"
          >
            <CurrentIcon className="h-[18px] w-[18px] shrink-0" />
            {/* Name + chevron hide when input has text (CSS transition) */}
            <div
              className={clsx(
                "flex items-center gap-1 overflow-hidden transition-all duration-300",
                isEmpty
                  ? "max-w-32 opacity-100"
                  : "max-w-0 opacity-0"
              )}
            >
              <span className="whitespace-nowrap text-sm font-semibold">
                {currentModel.name}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </div>
          </button>

          {/* Send / Stop button */}
          <div className="relative order-2 mb-0.5 ml-auto h-9 w-9 shrink-0 sm:order-none sm:ml-0">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isEmpty || isLoading}
              className={clsx(
                "absolute inset-0 flex items-center justify-center rounded-full transition-all duration-300 ease-out",
                isEmpty || isLoading
                  ? "scale-0 opacity-0"
                  : "scale-100 opacity-100 bg-foreground text-background hover:opacity-90"
              )}
            >
              <ArrowUp className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={!isLoading}
              className={clsx(
                "absolute inset-0 flex items-center justify-center rounded-full transition-all duration-300 ease-out",
                !isLoading
                  ? "scale-0 opacity-0"
                  : "scale-100 opacity-100 bg-foreground text-background hover:opacity-90"
              )}
            >
              <Square className="h-3.5 w-3.5" fill="currentColor" />
            </button>
          </div>
        </div>
      </div>

      {/* Dropdown rendered via portal to escape overflow-hidden */}
      {showModels &&
        dropdownPos &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowModels(false)}
            />
            <div
              className="fixed z-50 w-64 rounded-xl border border-border bg-background p-1 shadow-xl"
              style={{
                top: dropdownPos.top,
                right: dropdownPos.right,
                transform: "translateY(-100%)",
                maxWidth: "calc(100vw - 1.5rem)",
              }}
            >
              {MODELS.map(({ id, name, description, Icon }) => (
                <button
                  key={id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setModel(id);
                    setShowModels(false);
                  }}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-sidebar-hover"
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-foreground">
                    {id === model ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
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
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setXSearch((value) => !value);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-sidebar-hover"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center font-semibold text-xs text-foreground">
                    X
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-foreground">
                      Enable X Search
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Search X alongside the response
                    </span>
                  </span>
                </span>
                <span
                  className={clsx(
                    "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
                    xSearch
                      ? "border-foreground bg-foreground"
                      : "border-border bg-muted"
                  )}
                >
                  <span
                    className={clsx(
                      "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background transition-transform",
                      xSearch ? "translate-x-[18px]" : "translate-x-0.5"
                    )}
                  />
                </span>
              </button>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
