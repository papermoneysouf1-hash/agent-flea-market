"use client";

import { useEffect, useRef, useState } from "react";
import {
  Target, Plus, Square, Trash2, Loader2, CheckCircle2, AlertCircle, Clock,
  Send, Pause, Radio, Wand2,
} from "lucide-react";

// Hermes Goal Mode — set a long-horizon goal, walk away, Hermes loops until done.
// Mirrors the Codex Goal pattern but spawns `hermes chat -q ... --yolo --max-turns 50`.

const ACCENT = "#60a5fa"; // Hermes blue

type GoalStatus = "queued" | "running" | "completed" | "failed" | "stopped";
interface Goal {
  id: string;
  title: string;
  prompt: string;
  status: GoalStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  cwd: string;
  lastOutput?: string;
  exitCode?: number | null;
}

function fmtAgo(ms?: number): string {
  if (!ms) return "—";
  const d = Date.now() - ms;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}
function fmtDur(start?: number, end?: number): string {
  if (!start) return "—";
  const e = end ?? Date.now();
  const s = Math.floor((e - start) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function statusBadge(s: GoalStatus) {
  const map: Record<GoalStatus, { bg: string; fg: string; icon: React.ReactNode; label: string }> = {
    queued:    { bg: "rgba(110,99,83,0.18)",  fg: "var(--cream-dim)",     icon: <Clock size={11} />, label: "queued" },
    running:   { bg: "rgba(96,165,250,0.18)", fg: ACCENT,                  icon: <Loader2 size={11} className="animate-spin" />, label: "running" },
    completed: { bg: "rgba(90,184,150,0.18)", fg: "var(--emerald)",       icon: <CheckCircle2 size={11} />, label: "done" },
    failed:    { bg: "rgba(196,96,126,0.18)", fg: "var(--plum)",          icon: <AlertCircle size={11} />, label: "failed" },
    stopped:   { bg: "rgba(201,124,94,0.18)", fg: "var(--rust)",          icon: <Pause size={11} />, label: "stopped" },
  };
  const c = map[s];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest"
      style={{ background: c.bg, color: c.fg }}>
      {c.icon}{c.label}
    </span>
  );
}

export default function HermesGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    try {
      const r = await fetch("/api/hermes/goals", { cache: "no-store" });
      const j = await r.json();
      setGoals(Array.isArray(j.goals) ? j.goals : []);
    } catch {}
  }
  async function refreshOpenLog() {
    if (!openId) return;
    try {
      const r = await fetch(`/api/hermes/goals?id=${encodeURIComponent(openId)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.log !== undefined) setOpenLog(j.log);
    } catch {}
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => {
      refresh();
      if (openId) refreshOpenLog();
    }, 3500);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function create() {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/hermes/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || prompt.split("\n")[0].slice(0, 80), prompt }),
      });
      const j = await r.json();
      if (j.goal) {
        setTitle(""); setPrompt("");
        setOpenId(j.goal.id);
        refresh();
      } else {
        setError(j.error || "Failed to create goal");
      }
    } catch (e) { setError(String(e)); }
    setBusy(false);
  }
  async function stopOne(id: string) {
    await fetch(`/api/hermes/goals?id=${encodeURIComponent(id)}&action=stop`, { method: "PATCH" });
    refresh();
  }
  async function deleteOne(id: string) {
    if (!confirm("Delete this goal + log?")) return;
    await fetch(`/api/hermes/goals?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (openId === id) { setOpenId(null); setOpenLog(""); }
    refresh();
  }
  async function openGoal(id: string) {
    setOpenId(id); setOpenLog("");
    try {
      const r = await fetch(`/api/hermes/goals?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.log !== undefined) setOpenLog(j.log);
    } catch {}
  }

  const runningCount = goals.filter((g) => g.status === "running").length;

  return (
    <div className="space-y-4">
      {/* Hero strip */}
      <div className="relative overflow-hidden rounded-xl border p-4"
        style={{
          borderColor: `${ACCENT}40`,
          background:
            `radial-gradient(ellipse at 0% 0%, ${ACCENT}18, transparent 55%),` +
            `radial-gradient(ellipse at 100% 100%, rgba(212,165,116,0.10), transparent 55%),` +
            `linear-gradient(180deg, rgba(96,165,250,0.06), transparent)`,
        }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="grid place-items-center w-9 h-9 rounded-lg"
            style={{ background: `${ACCENT}24`, color: ACCENT, boxShadow: `0 0 26px -10px ${ACCENT}` }}>
            <Target size={16} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: ACCENT }}>Hermes · Goal Mode</div>
            <div className="text-[15px] font-medium text-[var(--cream)]">Set the target. Walk away.</div>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[10px] uppercase tracking-widest" style={{ color: "var(--cream-mute)" }}>
            {runningCount > 0 && (
              <span className="flex items-center gap-1.5">
                <Radio size={11} style={{ color: ACCENT }} className="animate-pulse" />
                {runningCount} running
              </span>
            )}
            <span>{goals.length} total</span>
          </div>
        </div>
        <p className="text-[12px] text-[var(--cream-dim)] max-w-[640px]">
          Hand Hermes a long-horizon goal. It runs <code className="px-1 rounded" style={{ background: "rgba(255,255,255,0.06)" }}>hermes chat --yolo --max-turns 50</code> in
          its own scratch dir. Close your laptop, go to sleep, come back to finished work.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
        {/* Create form + goal list */}
        <div className="space-y-4">
          <div className="panel p-4 space-y-2">
            <div className="action-tag mb-1" style={{ color: ACCENT }}>New goal</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Goal title (optional — auto-derived from prompt)"
              className="w-full p-2 rounded-md text-[12.5px]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--panel-border)", color: "var(--cream)" }} />
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should Hermes do? Be specific.&#10;&#10;Example: Generate 5 unique blog posts about AI automation for ecommerce, save to ./posts/ as .md with frontmatter, ready to deploy."
              rows={6}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) create(); }}
              className="w-full p-2.5 rounded-md text-[12.5px] resize-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--panel-border)", color: "var(--cream)" }} />
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-[var(--cream-mute)]">⌘+Enter to launch</div>
              <button onClick={create} disabled={busy || !prompt.trim()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition"
                style={{
                  background: busy ? "rgba(96,165,250,0.15)" : ACCENT,
                  color: busy ? ACCENT : "#0b1422",
                  border: `1px solid ${ACCENT}`,
                  boxShadow: busy ? undefined : `0 6px 22px -8px ${ACCENT}`,
                  opacity: busy || !prompt.trim() ? 0.7 : 1,
                }}>
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {busy ? "Spawning…" : "Launch goal"}
              </button>
            </div>
            {error && <div className="mt-1 text-[11px] text-[var(--plum)]">{error}</div>}
          </div>

          <div className="panel p-2">
            <div className="px-2 py-1.5 flex items-center justify-between">
              <div className="action-tag" style={{ color: ACCENT }}>Goals · {goals.length}</div>
              <button onClick={refresh} className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)] hover:text-[var(--cream)]">refresh</button>
            </div>
            {goals.length === 0 ? (
              <div className="p-6 text-center">
                <Wand2 size={24} style={{ color: ACCENT }} className="mx-auto mb-2" />
                <div className="text-[12.5px] text-[var(--cream)] mb-1">No goals yet</div>
                <div className="text-[11px] text-[var(--cream-mute)]">Launch your first one above. It runs in the background — close this tab and it keeps going.</div>
              </div>
            ) : (
              <div className="max-h-[520px] overflow-y-auto scroll space-y-1.5 p-1">
                {goals.map((g) => (
                  <button key={g.id} onClick={() => openGoal(g.id)}
                    className="w-full text-left p-3 rounded-md border transition hover:bg-[rgba(255,255,255,0.02)]"
                    style={{
                      borderColor: openId === g.id ? `${ACCENT}66` : "var(--line-soft)",
                      background: openId === g.id ? `${ACCENT}10` : "transparent",
                    }}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-[12.5px] text-[var(--cream)] truncate flex-1 font-medium">{g.title}</div>
                      {statusBadge(g.status)}
                    </div>
                    <div className="text-[10.5px] text-[var(--cream-mute)] mb-1.5 line-clamp-2">{g.prompt}</div>
                    <div className="flex items-center justify-between text-[10px] mono" style={{ color: "var(--cream-mute)" }}>
                      <span>{fmtAgo(g.createdAt)} · {fmtDur(g.startedAt, g.finishedAt)}</span>
                      <div className="flex items-center gap-2">
                        {g.status === "running" && (
                          <button onClick={(e) => { e.stopPropagation(); stopOne(g.id); }}
                            className="hover:text-[var(--plum)]" title="Stop">
                            <Square size={11} />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); deleteOne(g.id); }}
                          className="hover:text-[var(--plum)]" title="Delete">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                    {g.lastOutput && g.status === "running" && (
                      <div className="mt-1.5 text-[10px] mono text-[var(--cream-dim)] truncate" title={g.lastOutput}>
                        ↳ {g.lastOutput}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Open goal — live log */}
        <div className="panel p-3 flex flex-col min-h-[600px]">
          {openId ? (
            (() => {
              const g = goals.find((x) => x.id === openId);
              if (!g) return <div className="text-[11px] text-[var(--cream-mute)] italic p-3">Goal not found.</div>;
              return (
                <>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="min-w-0">
                      <div className="action-tag mb-0.5" style={{ color: ACCENT }}>Live log · {g.title}</div>
                      <div className="text-[10.5px] mono text-[var(--cream-mute)] truncate">{g.cwd}</div>
                    </div>
                    {statusBadge(g.status)}
                  </div>
                  <pre className="flex-1 min-h-0 overflow-auto scroll p-3 text-[11.5px] leading-relaxed whitespace-pre-wrap rounded-md"
                    style={{ background: "rgba(0,0,0,0.35)", color: "var(--cream-soft)", border: "1px solid var(--line-soft)" }}>
                    {openLog || (g.status === "running" ? "Waiting for first output…" : "(no log yet)")}
                  </pre>
                  <div className="mt-2 text-[10px] mono text-[var(--cream-mute)] flex items-center justify-between">
                    <span>Polling every 3.5s</span>
                    <a href={`/api/hermes/goals?id=${encodeURIComponent(g.id)}&log=1`} target="_blank" rel="noopener noreferrer"
                      className="hover:text-[var(--cream)] flex items-center gap-1">Open full log</a>
                  </div>
                </>
              );
            })()
          ) : (
            <div className="flex-1 grid place-items-center text-center p-6">
              <div className="max-w-[420px]">
                <Target size={36} style={{ color: ACCENT }} className="mx-auto mb-3" />
                <div className="text-[14px] text-[var(--cream)] font-medium mb-1">Pick a goal to watch live</div>
                <div className="text-[12px] text-[var(--cream-mute)] leading-relaxed">
                  Click any goal on the left to see its live log stream. Running goals update every 3.5s — watch Hermes work in real time.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
