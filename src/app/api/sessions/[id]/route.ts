import { NextResponse } from "next/server";
import { getSessionWithMessages, updateSessionTitle } from "@/lib/db/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { session, messages } = await getSessionWithMessages(id);

    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(
      { session, messages },
      {
        headers: {
          "Cache-Control": "private, max-age=0, stale-while-revalidate=5",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { title } = await req.json();
    if (title) {
      await updateSessionTitle(id, title);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}
