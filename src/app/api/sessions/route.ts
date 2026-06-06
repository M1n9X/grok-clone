import { NextResponse } from "next/server";
import {
  getSessions,
  createSession,
  deleteSession,
} from "@/lib/db/queries";
import { parseModelMode } from "@/lib/chat-request-guard";

export async function GET() {
  try {
    const sessions = await getSessions();
    return NextResponse.json(sessions, {
      headers: {
        "Cache-Control": "private, max-age=1, stale-while-revalidate=10",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, model } = await req.json();
    const modelMode = parseModelMode(model);
    if (!modelMode) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 });
    }

    const normalizedTitle =
      typeof title === "string" && title.trim()
        ? title.trim().slice(0, 120)
        : "New Chat";

    const session = await createSession(
      normalizedTitle,
      modelMode
    );
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    await deleteSession(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
