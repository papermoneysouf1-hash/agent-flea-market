import { spawnStream } from "@/lib/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { prompt, cwd } = await req.json();
  if (typeof prompt !== "string" || prompt.length === 0) {
    return new Response("missing prompt", { status: 400 });
  }
  if (prompt.length > 16_000) {
    return new Response("prompt too long", { status: 413 });
  }

  // Stream JSON line events from `claude -p --output-format=stream-json --include-partial-messages`
  const child = spawnStream("claude", [
    "-p",
    "--output-format=stream-json",
    "--include-partial-messages",
    "--verbose",
    prompt,
  ], { cwd });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Late stderr after close was throwing "Controller is already closed" — guard all sends.
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); }
        catch { closed = true; }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch {}
      };
      child.stdout.on("data", (b: Buffer) => send(b.toString()));
      child.stderr.on("data", (b: Buffer) => {
        send(JSON.stringify({ type: "stderr", text: b.toString() }) + "\n");
      });
      child.on("close", (code) => {
        send(JSON.stringify({ type: "done", code }) + "\n");
        safeClose();
      });
      child.on("error", (e) => {
        send(JSON.stringify({ type: "error", message: String(e) }) + "\n");
        safeClose();
      });
    },
    cancel() {
      try { child.kill("SIGTERM"); } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
