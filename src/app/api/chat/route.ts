import { NextResponse } from "next/server";

interface ChatMessage {
  role: "user" | "model" | "system";
  content: string;
}

interface ChatRequestBody {
  messages?: ChatMessage[];
  apiKey?: string;
  model?: string;
}

const GOOGLE_API = "https://generativelanguage.googleapis.com/v1beta";

function extractApiKey(req: Request): string | null {
  try {
    const body: ChatRequestBody | null = req.headers
      .get("content-type")
      ?.includes("application/json")
      ? undefined
      : undefined;

    const explicit = req.headers.get("x-api-key");
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) return auth.slice(7);
    if (explicit) return explicit;
  } catch {
    // ignore
  }
  return null;
}

export async function POST(request: Request) {
  let body: ChatRequestBody | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = body.apiKey || extractApiKey(request) || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || null;
  const rawModel = body.model || process.env.NEXT_PUBLIC_GOOGLE_MODEL || "gemini-2.5-flash";
  const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`;

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "No Google API key (GOOGLE_API_KEY / GEMINI_API_KEY)" }, { status: 500 });
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ ok: false, error: "messages[] is required" }, { status: 400 });
  }

  const contents = [];
  for (const msg of body.messages) {
    if (msg.role === "user") {
      contents.push({ role: "user", parts: [{ text: msg.content }] });
    } else if (msg.role === "model") {
      contents.push({ role: "model", parts: [{ text: msg.content }] });
    } else {
      contents.push({ role: "user", parts: [{ text: msg.content }] });
    }
  }

  const url = `${GOOGLE_API}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    }),
  });

  const text = await upstream.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, status: upstream.status, error: typeof parsed === "string" ? parsed : parsed?.error?.message || parsed }
    );
  }

  const reply = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return NextResponse.json({ ok: true, reply, raw: parsed });
}
