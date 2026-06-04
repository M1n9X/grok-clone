"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Plus } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { MODELS } from "@/components/chat-input";

const noopSubscribe = () => () => {};

function useHasMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

interface TopBarProps {
  model?: string;
  onNewChat?: () => void;
}

export function TopBar({ model = "auto", onNewChat }: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const mounted = useHasMounted();
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const currentModel = MODELS.find((m) => m.id === model) ?? MODELS[1]!;

  const themeOptions = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
  ];

  const currentThemeIcon =
    themeOptions.find((t) => t.value === theme)?.Icon ?? Moon;
  const ThemeIcon = currentThemeIcon;

  return (
    <header className="hidden h-12 shrink-0 items-center justify-between border-b border-border px-4 md:flex">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground">
          <currentModel.Icon className="h-3.5 w-3.5" />
          {currentModel.name}
        </span>
        {onNewChat && (
          <button
            type="button"
            onClick={onNewChat}
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Toggle theme"
          >
            {mounted ? (
              <ThemeIcon className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          {showThemeMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowThemeMenu(false)}
              />
              <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-xl border border-border bg-background p-1 shadow-xl">
                {themeOptions.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    onClick={() => {
                      setTheme(value);
                      setShowThemeMenu(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted ${
                      theme === value
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
