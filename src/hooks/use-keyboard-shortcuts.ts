"use client";

import { useEffect } from "react";

interface ShortcutHandlers {
  onNewChat?: () => void;
  onSearch?: () => void;
}

export function useKeyboardShortcuts({
  onNewChat,
  onSearch,
}: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta && e.key === "n") {
        e.preventDefault();
        onNewChat?.();
      }

      if (isMeta && e.key === "k") {
        e.preventDefault();
        onSearch?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewChat, onSearch]);
}
