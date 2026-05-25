"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Plus,
  MessageSquare,
  Trash2,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Pencil,
  Check,
  X,
} from "lucide-react";
import type { ChatSession } from "@/lib/types";
import { clsx } from "clsx";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh session list when route changes (e.g., new session created)
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, pathname]);

  async function handleNewChat() {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (res.ok) {
        const session = await res.json();
        await fetchSessions();
        router.push(`/chat/${session.id}`);
      }
    } catch {
      // ignore
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch("/api/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (pathname === `/chat/${id}`) {
        router.push("/");
      }
    } catch {
      // ignore
    }
  }

  function startEditing(session: ChatSession, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(session.id);
    setEditTitle(session.title);
  }

  async function saveTitle(id: string) {
    if (!editTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, title: editTitle.trim() } : s
        )
      );
    } finally {
      setEditingId(null);
    }
  }

  function cancelEditing() {
    setEditingId(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Group sessions by date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { label: string; items: ChatSession[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const session of sessions) {
    const d = new Date(session.updated_at);
    if (d >= today) groups[0]!.items.push(session);
    else if (d >= yesterday) groups[1]!.items.push(session);
    else if (d >= weekAgo) groups[2]!.items.push(session);
    else groups[3]!.items.push(session);
  }

  if (collapsed) {
    return (
      <div className="flex h-full w-14 shrink-0 flex-col items-center border-r border-border bg-sidebar py-3">
        <button
          onClick={onToggle}
          className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
        <button
          onClick={handleNewChat}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
        >
          <Plus className="h-5 w-5" />
        </button>
        <div className="flex-1" />
        <button
          onClick={handleLogout}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <button
          onClick={onToggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
        >
          <PanelLeftClose className="h-5 w-5" />
        </button>
        <button
          onClick={handleNewChat}
          className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            Loading...
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          groups.map(
            (group) =>
              group.items.length > 0 && (
                <div key={group.label} className="mb-2">
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map((session) => {
                    const isActive = pathname === `/chat/${session.id}`;
                    const isEditing = editingId === session.id;

                    return (
                      <div
                        key={session.id}
                        onClick={() => !isEditing && router.push(`/chat/${session.id}`)}
                        className={clsx(
                          "group relative flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-active text-foreground"
                            : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
                        )}
                      >
                        <MessageSquare className="mr-2.5 h-4 w-4 shrink-0 opacity-50" />

                        {isEditing ? (
                          <div className="flex flex-1 items-center gap-1">
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveTitle(session.id);
                                if (e.key === "Escape") cancelEditing();
                              }}
                              className="min-w-0 flex-1 rounded bg-transparent px-0 text-sm outline-none"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                saveTitle(session.id);
                              }}
                              className="shrink-0 text-green-500 hover:text-green-400"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelEditing();
                              }}
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 truncate">
                              {session.title}
                            </span>
                            <div className="ml-1 hidden shrink-0 items-center gap-0.5 group-hover:flex">
                              <button
                                onClick={(e) => startEditing(session, e)}
                                className="rounded p-1 text-muted-foreground hover:bg-sidebar-active hover:text-foreground"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => handleDelete(session.id, e)}
                                className="rounded p-1 text-muted-foreground hover:bg-red-500/20 hover:text-red-500"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
          )
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-2">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
