import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, role, content } = await req.json();

  if (!sessionId || !role || !content) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  if (role !== "assistant" && role !== "user") {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  const { error } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    user_id: user.id,
    role,
    content,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !target) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  const { error: deleteFromErr } = await supabase
    .from("chat_messages")
    .delete()
    .eq("session_id", target.session_id)
    .gte("created_at", target.created_at);

  if (deleteFromErr) {
    return Response.json({ error: deleteFromErr.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
