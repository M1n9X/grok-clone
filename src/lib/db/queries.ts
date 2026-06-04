import { createClient } from "@/lib/supabase/server";
import type { ChatSession, ChatMessage } from "@/lib/types";

export async function getSessions(): Promise<ChatSession[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, updated_at, user_id, model, created_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
}

export async function getSession(id: string): Promise<ChatSession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function createSession(
  title: string,
  model: string
): Promise<ChatSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_id: user.id, title, model })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSessionTitle(id: string, title: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_sessions")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteSession(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, session_id, role, content, created_at, user_id")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function saveMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string
): Promise<ChatMessage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ session_id: sessionId, user_id: user.id, role, content })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveMessages(
  sessionId: string,
  messages: { role: "user" | "assistant" | "system"; content: string }[]
): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const rows = messages.map((m) => ({
    session_id: sessionId,
    user_id: user.id,
    role: m.role,
    content: m.content,
  }));

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(rows)
    .select();

  if (error) throw error;
  return data ?? [];
}
