import { NextResponse } from "next/server";
import { listBoards, listTasks, statsFor, assigneesFor } from "@/lib/kanbanDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Direct SQLite reads — ~50ms total, vs ~2s+ when this used to shell out to `hermes kanban`.
// Writes still go through the CLI so all the side effects (events, dispatcher signals) fire correctly.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const board = url.searchParams.get("board") ?? undefined;
  const slug = board && /^[a-z0-9_-]{1,64}$/.test(board) ? board : undefined;

  try {
    const boards = listBoards();
    const activeSlug = slug ?? boards.find((b) => b.current)?.slug ?? "default";
    const [tasks, stats, assignees] = [
      listTasks(activeSlug, true),
      statsFor(activeSlug),
      assigneesFor(activeSlug),
    ];
    return NextResponse.json({
      board: activeSlug,
      boards: boards.map(({ slug, name, current }) => ({ slug, name, current })),
      tasks,
      stats,
      assignees,
      ok: true,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e), ok: false }, { status: 500 });
  }
}
