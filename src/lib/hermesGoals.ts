// Hermes Goal Mode — long-running autonomous goals tracked across restarts.
// Mirrors lib/codexGoals.ts but persisted to its own state file so Codex + Hermes
// goals don't collide.
//
// Each goal spawns `hermes chat -q "<prompt>" --yolo --accept-hooks --max-turns 50 -Q`
// in a dedicated cwd. Output streams to a per-goal log file the UI tails live.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const STATE_DIR = path.join(HOME, ".agentic-os");
const STATE_FILE = path.join(STATE_DIR, "hermes-goals.json");
export const GOAL_LOGS_DIR = path.join(STATE_DIR, "hermes-goal-logs");
export const HERMES_SCRATCH_ROOT = path.join(HOME, ".hermes", "goals");

export type GoalStatus = "queued" | "running" | "completed" | "failed" | "stopped";

export interface HermesGoal {
  id: string;
  title: string;
  prompt: string;
  status: GoalStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  pid?: number;
  cwd: string;
  lastOutput?: string;
  logFile: string;
  exitCode?: number | null;
}

interface State { goals: HermesGoal[]; }

async function readState(): Promise<State> {
  if (!existsSync(STATE_FILE)) return { goals: [] };
  try {
    const txt = await readFile(STATE_FILE, "utf8");
    const j = JSON.parse(txt);
    return { goals: Array.isArray(j.goals) ? j.goals : [] };
  } catch { return { goals: [] }; }
}

async function writeState(s: State): Promise<void> {
  if (!existsSync(STATE_DIR)) await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(s, null, 2));
}

export async function listGoals(): Promise<HermesGoal[]> {
  const s = await readState();
  // Reconcile running goals — if pid no longer exists, mark as stopped.
  for (const g of s.goals) {
    if (g.status === "running" && g.pid) {
      try { process.kill(g.pid, 0); /* alive */ }
      catch {
        g.status = "stopped";
        g.finishedAt = g.finishedAt ?? Date.now();
      }
    }
  }
  await writeState(s);
  return s.goals.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getGoal(id: string): Promise<HermesGoal | null> {
  const s = await readState();
  return s.goals.find((g) => g.id === id) ?? null;
}

export async function createGoal(title: string, prompt: string, cwd?: string): Promise<HermesGoal> {
  if (!existsSync(GOAL_LOGS_DIR)) await mkdir(GOAL_LOGS_DIR, { recursive: true });
  if (!existsSync(HERMES_SCRATCH_ROOT)) await mkdir(HERMES_SCRATCH_ROOT, { recursive: true });
  const id = `hg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const goalCwd = cwd ?? path.join(HERMES_SCRATCH_ROOT, id);
  if (!existsSync(goalCwd)) await mkdir(goalCwd, { recursive: true });
  const logFile = path.join(GOAL_LOGS_DIR, `${id}.log`);
  const goal: HermesGoal = {
    id,
    title: title.trim().slice(0, 120) || "Untitled goal",
    prompt: prompt.trim(),
    status: "queued",
    createdAt: Date.now(),
    cwd: goalCwd,
    logFile,
  };
  const s = await readState();
  s.goals.push(goal);
  await writeState(s);
  return goal;
}

export async function updateGoal(id: string, patch: Partial<HermesGoal>): Promise<HermesGoal | null> {
  const s = await readState();
  const g = s.goals.find((x) => x.id === id);
  if (!g) return null;
  Object.assign(g, patch);
  await writeState(s);
  return g;
}

export async function stopGoal(id: string): Promise<HermesGoal | null> {
  const s = await readState();
  const g = s.goals.find((x) => x.id === id);
  if (!g) return null;
  if (g.status === "running" && g.pid) {
    try { process.kill(g.pid, "SIGTERM"); } catch {}
    // Give it a beat, then SIGKILL if still around
    setTimeout(() => {
      try { process.kill(g.pid as number, 0); process.kill(g.pid as number, "SIGKILL"); } catch {}
    }, 2000);
  }
  g.status = "stopped";
  g.finishedAt = Date.now();
  g.pid = undefined;
  await writeState(s);
  return g;
}

export async function deleteGoal(id: string): Promise<boolean> {
  const s = await readState();
  const before = s.goals.length;
  s.goals = s.goals.filter((g) => g.id !== id);
  await writeState(s);
  return s.goals.length < before;
}

export async function readGoalLog(id: string, tail?: number): Promise<string> {
  const s = await readState();
  const g = s.goals.find((x) => x.id === id);
  if (!g) return "";
  if (!existsSync(g.logFile)) return "";
  const txt = await readFile(g.logFile, "utf8");
  if (typeof tail === "number" && tail > 0 && txt.length > tail) {
    return "…\n" + txt.slice(-tail);
  }
  return txt;
}
