import { NextResponse } from "next/server";

import { certivoApiFetch } from "@/lib/api/client";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

interface IncomingChatPayload {
  conversationId?: string;
  messages?: ChatMessage[];
  topK?: number;
}

export async function POST(request: Request) {
  const payload = (await request.json()) as IncomingChatPayload | null;
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return NextResponse.json({ error: "messages are required" }, { status: 400 });
  }

  const body = {
    conversationId: payload.conversationId,
    messages: payload.messages,
    topK: payload.topK
  };

  const result = await certivoApiFetch("/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  return NextResponse.json(result);
}
