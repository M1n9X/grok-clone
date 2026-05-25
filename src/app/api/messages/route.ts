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
