import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function agentsDir(): string {
  return path.join(process.cwd(), "..", "agents");
}

function resolveAgentFile(name: string): string | null {
  const directory = agentsDir();
  const extensions = [".md", ".txt"];
  
  // Try exact filename first
  const exact = path.join(directory, name);
  if (existsSync(exact)) return exact;
  
  // Try with each extension
  for (const ext of extensions) {
    const candidate = path.join(directory, `${name}${ext}`);
    if (existsSync(candidate)) return candidate;
    const candidate2 = path.join(directory, `${name.replace(/\.[^.]+$/, "")}${ext}`);
    if (existsSync(candidate2)) return candidate2;
  }
  
  return null;
}

export async function GET(
  _req: Request,
  ctx: { params: { name: string } }
) {
  const name = ctx.params?.name;
  if (!name) {
    return NextResponse.json({ ok: false, error: "missing name" }, { status: 400 });
  }
  const decoded = decodeURIComponent(name);
  const filePath = resolveAgentFile(decoded);
  if (!filePath) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  const content = readFileSync(filePath, "utf8");
  return NextResponse.json({ ok: true, agent: decoded, file: path.basename(filePath), content });
}
