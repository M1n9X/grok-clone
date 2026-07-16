import { createClient, getAuthUserId } from "@/lib/supabase/server";
import type { ChatSession, ChatMessage } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

async function getClient(supabase?: SupabaseClient) {
  return supabase ?? (await createClient());
}

export async function getSessions(
  supabase?: SupabaseClient
): Promise<ChatSession[]> {
  const client = await getClient(supabase);
  const { data, error } = await client
    .from("chat_sessions")
    .select("id, title, updated_at, user_id, model, created_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
}

export async function getSession(
  id: string,
  supabase?: SupabaseClient
): Promise<ChatSession | null> {
  const client = await getClient(supabase);
  const { data, error } = await client
    .from("chat_sessions")
    .select("id, title, user_id, model, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function getMessages(
  sessionId: string,
  supabase?: SupabaseClient
): Promise<ChatMessage[]> {
  const client = await getClient(supabase);
  const { data, error } = await client
    .from("chat_messages")
    .select("id, session_id, role, content, created_at, user_id")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

/** Single-client session + messages fetch for SSR and API routes. */
export async function getSessionWithMessages(id: string): Promise<{
  session: ChatSession | null;
  messages: ChatMessage[];
}> {
  const supabase = await createClient();
  const [session, messages] = await Promise.all([
    getSession(id, supabase),
    getMessages(id, supabase),
  ]);

  // If the session row is missing (optimistic client UUID not yet created),
  // return empty messages even if a stray query somehow returned rows.
  if (!session) {
    return { session: null, messages: [] };
  }

  return { session, messages };
}

export async function createSession(
  title: string,
  model: string
): Promise<ChatSession> {
  const supabase = await createClient();
  const userId = await getAuthUserId(supabase);

  if (!userId) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_id: userId, title, model })
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
  const { error } = await supabase.from("chat_sessions").delete().eq("id", id);

  if (error) throw error;
}

export async function saveMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string
): Promise<ChatMessage> {
  const supabase = await createClient();
  const userId = await getAuthUserId(supabase);

  if (!userId) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ session_id: sessionId, user_id: userId, role, content })
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
  const userId = await getAuthUserId(supabase);

  if (!userId) throw new Error("Not authenticated");

  const rows = messages.map((m) => ({
    session_id: sessionId,
    user_id: userId,
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
