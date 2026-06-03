import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function agentsDir(): string {
  return path.join(process.cwd(), "..", "agents");
}

function resolveName(name: string): string {
  const base = (name || "").replace(/\.(md|txt)$/i, "");
  const candidates = [
    `${base}.md`,
    `${base}.txt`,
  ];
  const dir = agentsDir();
  for (const c of candidates) {
    const p = path.join(dir, c);
    if (existsSync(p)) return p;
  }
  // direct file
  const direct = path.join(dir, name);
  if (existsSync(direct)) return direct;
  return path.join(dir, `${base}.txt`);
}

export async function GET(
  _req: Request,
  ctx: { params: { name: string } }
) {
  const file = resolveName(decodeURIComponent(ctx.params.name));
  if (!existsSync(file)) {
    return new Response("Not found", { status: 404 });
  }
  const content = readFileSync(file, "utf8");
  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
