import { createClient, getAuthUserId } from "@/lib/supabase/server";
import { CHAT_LIMITS } from "@/lib/chat-request-guard";
import { buildLazySessionInsert } from "@/lib/message-session-flow";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const supabase = await createClient();
  const userId = await getAuthUserId(supabase);

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, role, content, sessionTitle, sessionModel } =
    await req.json();

  if (!sessionId || !role || !content) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) {
    return Response.json({ error: "Invalid sessionId" }, { status: 400 });
  }

  if (role !== "assistant" && role !== "user") {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  if (
    typeof content !== "string" ||
    content.length > CHAT_LIMITS.maxMessageChars
  ) {
    return Response.json({ error: "Invalid content" }, { status: 400 });
  }

  // Ownership must be verified before insert: message RLS only checks
  // message.user_id, not session ownership (IDOR if we skip this).
  //
  // Cold path (first optimistic message): INSERT session directly — skips
  // the prior SELECT. On unique conflict, recheck ownership.
  // Warm path: SELECT ownership, then insert message.
  const wantsLazyCreate =
    sessionTitle !== undefined || sessionModel !== undefined;

  if (wantsLazyCreate) {
    const lazySession = buildLazySessionInsert({
      sessionId,
      userId,
      sessionTitle,
      sessionModel,
    });

    if (!lazySession) {
      return Response.json({ error: "Invalid model" }, { status: 400 });
    }

    const { error: createErr } = await supabase
      .from("chat_sessions")
      .insert(lazySession);

    if (createErr && createErr.code !== "23505") {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    if (createErr) {
      const { data: recheck } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .single();
      if (!recheck) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }
    }
  } else {
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      session_id: sessionId,
      user_id: userId,
      role,
      content,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, id: data.id });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const userId = await getAuthUserId(supabase);

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await req.json();

  if (!messageId) {
    return Response.json({ error: "Missing messageId" }, { status: 400 });
  }

  const { data: target, error: fetchErr } = await supabase
    .from("chat_messages")
    .select("session_id, created_at")
    .eq("id", messageId)
    .eq("user_id", userId)
    .single();

  if (fetchErr || !target) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  const { error: deleteFromErr } = await supabase
    .from("chat_messages")
    .delete()
    .eq("session_id", target.session_id)
    .eq("user_id", userId)
    .gte("created_at", target.created_at);

  if (deleteFromErr) {
    return Response.json({ error: deleteFromErr.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
