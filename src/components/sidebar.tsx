"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Search,
} from "lucide-react";
import type { ChatSession } from "@/lib/types";
import { clsx } from "clsx";
import { GrokLogo } from "@/components/grok-logo";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

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

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, pathname]);

  useEffect(() => {
    const refreshFlag = window.sessionStorage.getItem("refreshSessions");
    if (refreshFlag === "true") {
      window.sessionStorage.removeItem("refreshSessions");
      setTimeout(() => {
        fetchSessions();
      }, 100);
    }
  }, [fetchSessions]);

  useEffect(() => {
    const handleTitleUpdate = () => {
      fetchSessions();
    };
    window.addEventListener("sessionTitleUpdated", handleTitleUpdate);
    return () => {
      window.removeEventListener("sessionTitleUpdated", handleTitleUpdate);
    };
  }, [fetchSessions]);

  useEffect(() => {
    onMobileClose?.();
  }, [pathname, onMobileClose]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.classList.add("sidebar-open");
    } else {
      document.body.classList.remove("sidebar-open");
    }
    return () => document.body.classList.remove("sidebar-open");
  }, [mobileOpen]);

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
        onMobileClose?.();
      }
    } catch {
      // ignore
    }
  }

  function handleHome() {
    router.push("/");
    onMobileClose?.();
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
        onMobileClose?.();
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
    onMobileClose?.();
    router.push("/login");
    router.refresh();
  }

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

  const filteredSessions = searchQuery
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions;

  for (const session of filteredSessions) {
    const d = new Date(session.updated_at);
    if (d >= today) groups[0]!.items.push(session);
    else if (d >= yesterday) groups[1]!.items.push(session);
    else if (d >= weekAgo) groups[2]!.items.push(session);
    else groups[3]!.items.push(session);
  }

  const collapsedSidebar = (
    <div className="hidden h-full w-14 shrink-0 flex-col items-center border-r border-border bg-sidebar py-3 md:flex">
      <button
        onClick={handleHome}
        aria-label="Go to home"
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-sidebar-hover"
      >
        <GrokLogo className="h-4 w-8" />
      </button>
      <button
        onClick={onToggle}
        aria-label="Expand sidebar"
        className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
      >
        <PanelLeft className="h-5 w-5" />
      </button>
      <button
        onClick={handleNewChat}
        aria-label="New chat"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
      >
        <Plus className="h-5 w-5" />
      </button>
      <div className="flex-1" />
      <button
        onClick={handleLogout}
        aria-label="Sign out"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  const expandedSidebar = (
    <div className="flex h-full w-full min-w-0 flex-col bg-sidebar md:w-64 md:border-r md:border-border">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex min-w-0 items-center gap-1">
          <button
            onClick={handleHome}
            aria-label="Go to home"
            className="flex h-9 w-16 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-sidebar-hover"
          >
            <GrokLogo className="h-6 w-15" />
          </button>
          <button
            onClick={() => {
              if (onMobileClose && window.innerWidth < 768) {
                onMobileClose();
                return;
              }
              onToggle();
            }}
            aria-label="Close sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        </div>
        <button
          onClick={handleNewChat}
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="px-2 pb-1">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
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
                        onClick={() => {
                          if (!isEditing) {
                            router.push(`/chat/${session.id}`);
                            onMobileClose?.();
                          }
                        }}
                        className={clsx(
                          "group relative flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-active text-foreground"
                            : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
                        )}
                      >
                        <MessageSquare className="mr-2.5 h-4 w-4 shrink-0 opacity-50" />

                        {isEditing ? (
                          <div className="flex min-w-0 flex-1 items-center gap-1">
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
                            <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                              <button
                                onClick={(e) => startEditing(session, e)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-active hover:text-foreground md:h-auto md:w-auto md:p-1"
                              >
                                <Pencil className="h-3.5 w-3.5 md:h-3 md:w-3" />
                              </button>
                              <button
                                onClick={(e) => handleDelete(session.id, e)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/20 hover:text-red-500 md:h-auto md:w-auto md:p-1"
                              >
                                <Trash2 className="h-3.5 w-3.5 md:h-3 md:w-3" />
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

      <div className="border-t border-border p-2 safe-bottom">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {collapsed ? (
        collapsedSidebar
      ) : (
        <div className="hidden h-full shrink-0 md:flex">{expandedSidebar}</div>
      )}

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={onMobileClose}
            className="absolute inset-0 bg-black/45"
          />
          <aside className="relative h-full w-[min(82vw,20rem)] border-r border-border bg-sidebar shadow-2xl safe-bottom">
            {expandedSidebar}
          </aside>
        </div>
      )}
    </>
  );
}
