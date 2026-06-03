"use client";

import { useEffect, useRef, useState } from "react";
import {
  ImageIcon, Film, Mic, Search, Sparkles, Loader2, Send, ExternalLink,
  Download, Play, Radio, Wand2, Clock, History,
} from "lucide-react";

// OpenClaw Studio — Grok 4.3's creative cockpit.
// Four sub-tools all backed by `openclaw infer` against the xAI plugin:
//   Image  →  xai/grok-imagine-image
//   Video  →  xai/grok-imagine-video
//   Voice  →  xai TTS (6 voices: eve/ara/rex/sal/leo/una)
//   Search →  Grok live X-search
//
// Pink (#f472b6) accent matching the rest of the OpenClaw UI. Every output
// auto-saves to ~/.openclaw/studio/{images,videos,audio} so the Workspace tab
// (Studio · Images / Studio · Videos / Studio · Voice buckets) shows it too.

const ACCENT = "#f472b6";
type SubTool = "image" | "search" | "voice" | "video";

interface StudioMeta {
  kind: "image" | "video" | "audio" | "search";
  prompt: string;
  model?: string;
  provider?: string;
  createdAt: number;
  durationMs?: number;
  voice?: string;
  aspectRatio?: string;
  resolution?: string;
  audio?: boolean;
  width?: number;
  height?: number;
  bytes?: number;
}

interface StudioItem {
  name: string;
  relPath: string;
  bytes: number;
  mtime: number;
  kind: string;
  url: string;
  meta: StudioMeta | null;
}

interface SavedSearch {
  id: string;
  query: string;
  answer: string;
  citations: string[];
  model?: string;
  provider?: string;
  tookMs?: number;
  createdAt: number;
}

function fmtAgo(ms: number): string {
  if (!ms) return "—";
  const d = Date.now() - ms;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}
function fmtBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / (1024 * 1024)).toFixed(1)}MB`;
}

export default function OpenClawStudio() {
  const [tool, setTool] = useState<SubTool>("image");
  return (
    <div className="space-y-4">
      {/* Studio hero strip — sets the magic-tier tone */}
      <div className="relative overflow-hidden rounded-xl border p-4"
        style={{
          borderColor: `${ACCENT}40`,
          background:
            `radial-gradient(ellipse at 0% 0%, ${ACCENT}18, transparent 55%),` +
            `radial-gradient(ellipse at 100% 100%, rgba(212,165,116,0.10), transparent 55%),` +
            `linear-gradient(180deg, rgba(244,114,182,0.06), transparent)`,
        }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="grid place-items-center w-9 h-9 rounded-lg"
            style={{ background: `${ACCENT}24`, color: ACCENT, boxShadow: `0 0 26px -10px ${ACCENT}` }}>
            <Sparkles size={16} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: ACCENT }}>OpenClaw · Studio</div>
            <div className="text-[15px] font-medium text-[var(--cream)]">
              Grok 4.3 creative cockpit
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-widest" style={{ color: "var(--cream-mute)" }}>
            <Radio size={11} style={{ color: ACCENT }} className="animate-pulse" />
            <span>xAI · live</span>
          </div>
        </div>
        <p className="text-[12px] text-[var(--cream-dim)] max-w-[640px]">
          Generate images, videos, and voice. Live-search X. All powered by your xAI OAuth login.
          Every output auto-saves to your Workspace.
        </p>
      </div>

      {/* Sub-tool tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: "image",  label: "Image",     icon: <ImageIcon size={14} /> },
          { key: "search", label: "X-Search",  icon: <Search size={14} /> },
          { key: "voice",  label: "Voice",     icon: <Mic size={14} /> },
          { key: "video",  label: "Video",     icon: <Film size={14} /> },
        ] as { key: SubTool; label: string; icon: React.ReactNode }[]).map((t) => {
          const active = tool === t.key;
          return (
            <button key={t.key} onClick={() => setTool(t.key)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12.5px] transition"
              style={{
                background: active ? `${ACCENT}1f` : "transparent",
                borderColor: active ? ACCENT : "var(--panel-border)",
                color: active ? "var(--cream)" : "var(--cream-dim)",
                boxShadow: active ? `0 0 22px -10px ${ACCENT}` : undefined,
              }}>
              {t.icon}{t.label}
            </button>
          );
        })}
      </div>

      {tool === "image" && <StudioImage />}
      {tool === "search" && <StudioXSearch />}
      {tool === "voice" && <StudioVoice />}
      {tool === "video" && <StudioVideo />}
    </div>
  );
}

// ─── IMAGE ──────────────────────────────────────────────────────────────────
function StudioImage() {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<{ url: string; width?: number; height?: number; bytes?: number; prompt?: string; aspectRatio?: string; createdAt?: number } | null>(null);
  const [recent, setRecent] = useState<StudioItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadRecent() {
    try {
      const r = await fetch("/api/openclaw/studio/list?kind=images", { cache: "no-store" });
      const j = await r.json();
      setRecent(j.items ?? []);
    } catch {}
  }
  useEffect(() => { loadRecent(); }, []);

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/openclaw/studio/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspectRatio: aspect }),
      });
      const j = await r.json();
      if (j.ok && j.outputs?.[0]) {
        const o = j.outputs[0];
        setCurrent({ url: o.url, width: o.width, height: o.height, bytes: o.size, prompt, aspectRatio: aspect, createdAt: Date.now() });
        loadRecent();
      } else {
        setError(j.stderr || "Generation failed");
      }
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  }

  function restore(it: StudioItem) {
    setCurrent({
      url: it.url,
      bytes: it.bytes,
      width: it.meta?.width,
      height: it.meta?.height,
      prompt: it.meta?.prompt,
      aspectRatio: it.meta?.aspectRatio,
      createdAt: it.meta?.createdAt ?? it.mtime,
    });
    // Restore prompt + settings to the form so user can riff
    if (it.meta?.prompt) setPrompt(it.meta.prompt);
    if (it.meta?.aspectRatio) setAspect(it.meta.aspectRatio);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      <PromptCard title="Image · grok-imagine-image" accent={ACCENT}>
        <label className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">Prompt</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="A cinematic shot of a golden lobster in a midnight aubergine void, volumetric light, 35mm film"
          rows={4}
          className="w-full p-2.5 rounded-md text-[12.5px] resize-none"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--panel-border)", color: "var(--cream)" }} />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">Aspect</label>
            <select value={aspect} onChange={(e) => setAspect(e.target.value)}
              className="w-full p-1.5 rounded-md text-[12px]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--panel-border)", color: "var(--cream)" }}>
              <option value="1:1">1:1 (square)</option>
              <option value="16:9">16:9 (wide)</option>
              <option value="9:16">9:16 (vertical / story)</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
            </select>
          </div>
          <div className="grid place-items-end">
            <GenerateButton onClick={generate} busy={busy} label={busy ? "Generating…" : "Generate"} />
          </div>
        </div>
        {error && <div className="mt-2 text-[11px] text-[var(--plum)] truncate" title={error}>{error.slice(0, 200)}</div>}
      </PromptCard>

      <PreviewCard title={current ? "Latest image" : "Preview"} accent={ACCENT}>
        {current ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt="generated" className="flex-1 min-h-0 w-full object-contain bg-black/40 rounded-md max-h-[440px]" />
            {current.prompt && (
              <div className="mt-2 p-2 rounded-md text-[11.5px] text-[var(--cream-soft)] leading-relaxed"
                style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}25` }}>
                <span className="text-[10px] uppercase tracking-widest mr-2" style={{ color: ACCENT }}>prompt</span>
                {current.prompt}
              </div>
            )}
            <div className="flex items-center justify-between mt-2 text-[10.5px] mono" style={{ color: "var(--cream-mute)" }}>
              <span>
                {current.width && current.height ? `${current.width}×${current.height}` : ""}
                {current.bytes ? ` · ${fmtBytes(current.bytes)}` : ""}
                {current.aspectRatio ? ` · ${current.aspectRatio}` : ""}
                {current.createdAt ? ` · ${fmtAgo(current.createdAt)}` : ""}
              </span>
              <div className="flex items-center gap-3">
                <a href={current.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--cream)] flex items-center gap-1">
                  <ExternalLink size={11} /> New tab
                </a>
                <a href={current.url} download className="hover:text-[var(--cream)] flex items-center gap-1">
                  <Download size={11} /> Save
                </a>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon={<Wand2 size={28} style={{ color: ACCENT }} />} title="Generate your first image"
            hint="Type a prompt on the left and hit Generate. Output renders here in ~5 seconds." />
        )}
      </PreviewCard>

      {/* Full history grid spanning both columns */}
      <div className="lg:col-span-2">
        <HistoryGrid items={recent} onClick={restore} title="Your image history" />
      </div>
    </div>
  );
}

// ─── X-SEARCH ───────────────────────────────────────────────────────────────
function StudioXSearch() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<string[]>([]);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [lastCreatedAt, setLastCreatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [history, setHistory] = useState<SavedSearch[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadHistory() {
    try {
      const r = await fetch("/api/openclaw/studio/searches", { cache: "no-store" });
      const j = await r.json();
      setHistory(j.items ?? []);
    } catch {}
  }
  useEffect(() => { loadHistory(); }, []);

  async function search() {
    if (!query.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/openclaw/studio/xsearch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 20 }),
      });
      const j = await r.json();
      if (j.ok) {
        setAnswer(j.answer ?? null);
        setCitations(j.citations ?? []);
        setTookMs(j.tookMs ?? null);
        setLastQuery(j.query ?? query);
        setLastCreatedAt(Date.now());
        loadHistory();
      } else {
        setError(j.stderr || "Search failed");
      }
    } catch (e) { setError(String(e)); }
    setBusy(false);
  }

  function openHistory(rec: SavedSearch) {
    setAnswer(rec.answer);
    setCitations(rec.citations);
    setTookMs(rec.tookMs ?? null);
    setLastQuery(rec.query);
    setLastCreatedAt(rec.createdAt);
    setQuery(rec.query);
  }

  async function deleteHistory(id: string) {
    if (!confirm("Delete this saved search?")) return;
    await fetch(`/api/openclaw/studio/searches?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    loadHistory();
  }

  // Auto-refresh ticker — turns the panel into a live Bloomberg-terminal vibe.
  useEffect(() => {
    if (autoRefresh && lastQuery) {
      timer.current = setInterval(() => { search(); }, 30_000);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, lastQuery]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      <PromptCard title="Live X-Search · Grok" accent={ACCENT}>
        <label className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">Query</label>
        <textarea value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="What are people saying about OpenClaw on X today?"
          rows={3}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) search(); }}
          className="w-full p-2.5 rounded-md text-[12.5px] resize-none"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--panel-border)", color: "var(--cream)" }} />
        <div className="flex items-center justify-between mt-2">
          <label className="flex items-center gap-2 text-[11px] text-[var(--cream-dim)] cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh (30s)
          </label>
          <GenerateButton onClick={search} busy={busy} label={busy ? "Searching…" : "Search X"} />
        </div>
        {error && <div className="mt-2 text-[11px] text-[var(--plum)] truncate" title={error}>{error.slice(0, 200)}</div>}
        {lastQuery && (
          <div className="mt-3 p-2 rounded-md text-[10.5px]" style={{ background: `${ACCENT}10`, color: "var(--cream-dim)" }}>
            <Radio size={10} className="inline mr-1" style={{ color: ACCENT }} />
            Live results for &ldquo;<span className="text-[var(--cream)]">{lastQuery}</span>&rdquo;
            {autoRefresh && <span className="ml-1">· auto-refreshing every 30s</span>}
          </div>
        )}
      </PromptCard>

      <PreviewCard title={lastQuery ? `${lastCreatedAt && (Date.now() - lastCreatedAt > 60_000) ? "From history" : "Live"}${tookMs ? ` · ${(tookMs / 1000).toFixed(1)}s` : ''}` : "Results"} accent={ACCENT}>
        {!lastQuery ? (
          <EmptyState icon={<Search size={28} style={{ color: ACCENT }} />} title="Search X live"
            hint="Type a query, hit Search X. Grok pulls live X posts, articles, and replies — synthesizes a real-time answer with citations. Flick Auto-refresh on for a Bloomberg-terminal feel." />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto scroll">
            {answer ? (
              <div className="space-y-3">
                <div className="p-4 rounded-md" style={{ background: `${ACCENT}0a`, border: `1px solid ${ACCENT}30` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Radio size={11} style={{ color: ACCENT }} className="animate-pulse" />
                    <span className="text-[10px] uppercase tracking-widest" style={{ color: ACCENT }}>Grok · live answer</span>
                  </div>
                  <div className="text-[12.5px] text-[var(--cream)] leading-relaxed whitespace-pre-wrap">
                    {renderInlineCitations(answer, citations)}
                  </div>
                </div>
                {citations.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--cream-mute)" }}>
                      {citations.length} source{citations.length === 1 ? "" : "s"}
                    </div>
                    {citations.map((url, i) => {
                      let host = url;
                      try { host = new URL(url).hostname.replace("www.", ""); } catch {}
                      return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 rounded-md border transition hover:bg-[rgba(255,255,255,0.03)]"
                          style={{ borderColor: "var(--line-soft)" }}>
                          <span className="grid place-items-center w-5 h-5 rounded text-[10px] mono"
                            style={{ background: `${ACCENT}18`, color: ACCENT, flexShrink: 0 }}>{i + 1}</span>
                          <span className="text-[11.5px] mono uppercase tracking-wide" style={{ color: ACCENT, flexShrink: 0 }}>{host}</span>
                          <span className="text-[11px] text-[var(--cream-dim)] truncate">{url}</span>
                          <ExternalLink size={11} className="ml-auto text-[var(--cream-mute)]" />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-[var(--cream-mute)] italic p-3">No answer.</div>
            )}
          </div>
        )}
      </PreviewCard>

      {/* Saved searches — full history spanning both columns */}
      <div className="lg:col-span-2">
        <SearchHistory items={history} onClick={openHistory} onDelete={deleteHistory} />
      </div>
    </div>
  );
}

// ─── VOICE / TTS ────────────────────────────────────────────────────────────
const XAI_VOICES = ["eve", "ara", "rex", "sal", "leo", "una"];
function StudioVoice() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("eve");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<{ url: string; bytes?: number; voice: string; text?: string; createdAt?: number } | null>(null);
  const [recent, setRecent] = useState<StudioItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadRecent() {
    try {
      const r = await fetch("/api/openclaw/studio/list?kind=audio", { cache: "no-store" });
      const j = await r.json();
      setRecent(j.items ?? []);
    } catch {}
  }
  useEffect(() => { loadRecent(); }, []);

  async function speak() {
    if (!text.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/openclaw/studio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
      const j = await r.json();
      if (j.ok && j.outputs?.[0]) {
        setCurrent({ url: j.outputs[0].url, bytes: j.outputs[0].size, voice: j.voice, text, createdAt: Date.now() });
        loadRecent();
      } else {
        setError(j.stderr || "TTS failed");
      }
    } catch (e) { setError(String(e)); }
    setBusy(false);
  }

  function restore(it: StudioItem) {
    setCurrent({
      url: it.url,
      bytes: it.bytes,
      voice: it.meta?.voice ?? "eve",
      text: it.meta?.prompt,
      createdAt: it.meta?.createdAt ?? it.mtime,
    });
    if (it.meta?.prompt) setText(it.meta.prompt);
    if (it.meta?.voice) setVoice(it.meta.voice);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      <PromptCard title="Voice · xAI TTS" accent={ACCENT}>
        <label className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">Say this</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Welcome to the OpenClaw OS. The lobster is now your AI overlord."
          rows={4}
          className="w-full p-2.5 rounded-md text-[12.5px] resize-none"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--panel-border)", color: "var(--cream)" }} />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">Voice</label>
            <select value={voice} onChange={(e) => setVoice(e.target.value)}
              className="w-full p-1.5 rounded-md text-[12px] capitalize"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--panel-border)", color: "var(--cream)" }}>
              {XAI_VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="grid place-items-end">
            <GenerateButton onClick={speak} busy={busy} label={busy ? "Speaking…" : "Speak"} />
          </div>
        </div>
        {error && <div className="mt-2 text-[11px] text-[var(--plum)] truncate" title={error}>{error.slice(0, 200)}</div>}
      </PromptCard>

      <PreviewCard title={current ? `Playback · ${current.voice}` : "Playback"} accent={ACCENT}>
        {current ? (
          <div className="flex-1 min-h-0 grid place-items-center p-6">
            <div className="w-full max-w-[480px] space-y-3">
              <div className="text-[10.5px] uppercase tracking-widest text-center" style={{ color: "var(--cream-mute)" }}>
                {current.voice} · {current.bytes ? fmtBytes(current.bytes) : ""}
                {current.createdAt ? ` · ${fmtAgo(current.createdAt)}` : ""}
              </div>
              {current.text && (
                <div className="p-2 rounded-md text-[11.5px] text-[var(--cream-soft)] leading-relaxed text-center"
                  style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}25` }}>
                  &ldquo;{current.text}&rdquo;
                </div>
              )}
              <audio src={current.url} controls autoPlay className="w-full" />
              <div className="flex items-center justify-center gap-3 text-[10.5px] mono" style={{ color: "var(--cream-mute)" }}>
                <a href={current.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--cream)] flex items-center gap-1">
                  <ExternalLink size={11} /> New tab
                </a>
                <a href={current.url} download className="hover:text-[var(--cream)] flex items-center gap-1">
                  <Download size={11} /> Save
                </a>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon={<Mic size={28} style={{ color: ACCENT }} />} title="Hear Grok speak"
            hint="Type something and pick a voice. xAI ships six voices — eve, ara, rex, sal, leo, una. Each one's different. Try them all." />
        )}
      </PreviewCard>

      {/* Full history grid spanning both columns */}
      <div className="lg:col-span-2">
        <HistoryGrid items={recent} onClick={restore} title="Your voice history" />
      </div>
    </div>
  );
}

// ─── VIDEO ──────────────────────────────────────────────────────────────────
function StudioVideo() {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState<"480P"|"720P"|"768P"|"1080P">("720P");
  const [audio, setAudio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<{ url: string; bytes?: number; width?: number; height?: number; prompt?: string; createdAt?: number } | null>(null);
  const [recent, setRecent] = useState<StudioItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadRecent() {
    try {
      const r = await fetch("/api/openclaw/studio/list?kind=videos", { cache: "no-store" });
      const j = await r.json();
      setRecent(j.items ?? []);
    } catch {}
  }
  useEffect(() => { loadRecent(); }, []);

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/openclaw/studio/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspectRatio: aspect, resolution, audio }),
      });
      const j = await r.json();
      if (j.ok && j.outputs?.[0]) {
        setCurrent({ url: j.outputs[0].url, bytes: j.outputs[0].size, width: j.outputs[0].width, height: j.outputs[0].height, prompt, createdAt: Date.now() });
        loadRecent();
      } else {
        setError(j.stderr || "Video gen failed");
      }
    } catch (e) { setError(String(e)); }
    setBusy(false);
  }

  function restore(it: StudioItem) {
    setCurrent({
      url: it.url,
      bytes: it.bytes,
      width: it.meta?.width,
      height: it.meta?.height,
      prompt: it.meta?.prompt,
      createdAt: it.meta?.createdAt ?? it.mtime,
    });
    if (it.meta?.prompt) setPrompt(it.meta.prompt);
    if (it.meta?.aspectRatio) setAspect(it.meta.aspectRatio);
    if (it.meta?.resolution && /^(480P|720P|768P|1080P)$/.test(it.meta.resolution)) {
      setResolution(it.meta.resolution as "480P"|"720P"|"768P"|"1080P");
    }
    if (typeof it.meta?.audio === "boolean") setAudio(it.meta.audio);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      <PromptCard title="Video · grok-imagine-video" accent={ACCENT}>
        <label className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">Prompt</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="A golden lobster swimming through clouds at sunset, cinematic 4K"
          rows={4}
          className="w-full p-2.5 rounded-md text-[12.5px] resize-none"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--panel-border)", color: "var(--cream)" }} />
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">Aspect</label>
            <select value={aspect} onChange={(e) => setAspect(e.target.value)}
              className="w-full p-1.5 rounded-md text-[12px]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--panel-border)", color: "var(--cream)" }}>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">Res</label>
            <select value={resolution} onChange={(e) => setResolution(e.target.value as "480P"|"720P"|"768P"|"1080P")}
              className="w-full p-1.5 rounded-md text-[12px]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--panel-border)", color: "var(--cream)" }}>
              <option value="480P">480P</option>
              <option value="720P">720P</option>
              <option value="1080P">1080P</option>
            </select>
          </div>
          <label className="grid place-items-center text-[10px] uppercase tracking-widest cursor-pointer rounded-md border"
            style={{ borderColor: audio ? ACCENT : "var(--panel-border)", color: audio ? ACCENT : "var(--cream-dim)", background: audio ? `${ACCENT}10` : "transparent" }}>
            <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} className="hidden" />
            Audio
          </label>
        </div>
        <div className="mt-3"><GenerateButton onClick={generate} busy={busy} label={busy ? "Rendering…" : "Generate video"} fullWidth /></div>
        <div className="mt-2 text-[10.5px] text-[var(--cream-mute)]">Video gen takes ~30–90s. Don&apos;t close the tab.</div>
        {error && <div className="mt-2 text-[11px] text-[var(--plum)] truncate" title={error}>{error.slice(0, 200)}</div>}
      </PromptCard>

      <PreviewCard title={current ? "Latest video" : "Preview"} accent={ACCENT}>
        {current ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 grid place-items-center bg-black/40 rounded-md p-2 max-h-[440px]">
              <video src={current.url} controls autoPlay className="max-w-full max-h-full" />
            </div>
            {current.prompt && (
              <div className="mt-2 p-2 rounded-md text-[11.5px] text-[var(--cream-soft)] leading-relaxed"
                style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}25` }}>
                <span className="text-[10px] uppercase tracking-widest mr-2" style={{ color: ACCENT }}>prompt</span>
                {current.prompt}
              </div>
            )}
            <div className="flex items-center justify-between mt-2 text-[10.5px] mono" style={{ color: "var(--cream-mute)" }}>
              <span>
                {current.width && current.height ? `${current.width}×${current.height}` : ""}
                {current.bytes ? ` · ${fmtBytes(current.bytes)}` : ""}
                {current.createdAt ? ` · ${fmtAgo(current.createdAt)}` : ""}
              </span>
              <div className="flex items-center gap-3">
                <a href={current.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--cream)] flex items-center gap-1">
                  <ExternalLink size={11} /> New tab
                </a>
                <a href={current.url} download className="hover:text-[var(--cream)] flex items-center gap-1">
                  <Download size={11} /> Save
                </a>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon={<Film size={28} style={{ color: ACCENT }} />} title="Make a video"
            hint="Type a scene, hit Generate video. Grok Imagine renders a short cinematic clip. ~30 seconds to first frame." />
        )}
      </PreviewCard>

      {/* Full history grid spanning both columns */}
      <div className="lg:col-span-2">
        <HistoryGrid items={recent} onClick={restore} title="Your video history" />
      </div>
    </div>
  );
}

// Render Grok's `[[N]](url)` inline citation markers as small numbered badges.
// Leaves the rest of the markdown-ish text as-is (we display it whitespace-pre-wrap).
function renderInlineCitations(text: string, citations: string[]): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\[\[(\d+)\]\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const n = match[1];
    const url = match[2];
    parts.push(
      <a key={`cite-${key++}`} href={url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] mono align-middle mx-0.5 hover:scale-110 transition"
        style={{ background: `${ACCENT}28`, color: ACCENT, textDecoration: "none" }}
        title={url}>{n}</a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  // Suppress unused-var warning when citations list isn't referenced inline (we still pass it in case future renderers want to look up by index)
  void citations;
  return parts;
}

// ─── Shared bits ────────────────────────────────────────────────────────────
function PromptCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4 space-y-2 min-h-[420px] flex flex-col">
      <div className="action-tag mb-1" style={{ color: accent }}>{title}</div>
      {children}
    </div>
  );
}

function PreviewCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="panel p-3 flex flex-col min-h-[420px]">
      <div className="action-tag mb-2 px-1" style={{ color: accent }}>{title}</div>
      {children}
    </div>
  );
}

function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="flex-1 min-h-0 grid place-items-center text-center p-6">
      <div className="max-w-[360px]">
        <div className="mb-3 grid place-items-center">{icon}</div>
        <div className="text-[14px] text-[var(--cream)] font-medium mb-1">{title}</div>
        <div className="text-[11.5px] text-[var(--cream-mute)] leading-relaxed">{hint}</div>
      </div>
    </div>
  );
}

function GenerateButton({ onClick, busy, label, fullWidth }: { onClick: () => void; busy: boolean; label: string; fullWidth?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy}
      className={`flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition ${fullWidth ? "w-full" : ""}`}
      style={{
        background: busy ? "rgba(244,114,182,0.15)" : ACCENT,
        color: busy ? ACCENT : "#1a0f20",
        border: `1px solid ${ACCENT}`,
        opacity: busy ? 0.85 : 1,
        boxShadow: busy ? undefined : `0 6px 22px -8px ${ACCENT}`,
      }}>
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
      {label}
    </button>
  );
}

// HistoryGrid — the persistent record of everything you've ever generated.
// Replaces the small 6-thumbnail strip with a full scrollable grid that shows
// the original prompt under each item. Click → restores prompt + result.
function HistoryGrid({ items, onClick, title }: { items: StudioItem[]; onClick: (it: StudioItem) => void; title: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 12);

  return (
    <div className="panel p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History size={13} style={{ color: ACCENT }} />
          <div className="action-tag" style={{ color: ACCENT }}>{title}</div>
          <span className="text-[10.5px] mono" style={{ color: "var(--cream-mute)" }}>· {items.length} saved</span>
        </div>
        {items.length > 12 && (
          <button onClick={() => setExpanded(!expanded)}
            className="text-[10.5px] uppercase tracking-widest hover:text-[var(--cream)] transition"
            style={{ color: "var(--cream-mute)" }}>
            {expanded ? "Show less" : `Show all ${items.length}`}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-[var(--cream-mute)] italic">
          Nothing yet — your generations save here automatically. Come back any time.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
          {visible.map((it) => (
            <button key={it.relPath} onClick={() => onClick(it)}
              className="group text-left rounded-md overflow-hidden border transition hover:scale-[1.03]"
              style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.02)" }}
              title={it.meta?.prompt ?? it.name}>
              <div className="aspect-square overflow-hidden bg-black/40">
                {it.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.url} alt={it.meta?.prompt ?? it.name} className="w-full h-full object-cover group-hover:scale-110 transition" />
                ) : it.kind === "video" ? (
                  <div className="w-full h-full grid place-items-center relative">
                    <video src={it.url} className="absolute inset-0 w-full h-full object-cover opacity-70" />
                    <div className="relative z-10 w-10 h-10 rounded-full grid place-items-center"
                      style={{ background: "rgba(0,0,0,0.55)", border: `1px solid ${ACCENT}` }}>
                      <Play size={18} style={{ color: ACCENT }} />
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full grid place-items-center"
                    style={{ background: `linear-gradient(135deg, ${ACCENT}18, transparent)` }}>
                    <Mic size={26} style={{ color: ACCENT }} />
                  </div>
                )}
              </div>
              <div className="px-2 py-1.5 space-y-0.5">
                <div className="text-[10.5px] text-[var(--cream-soft)] leading-snug line-clamp-2"
                  title={it.meta?.prompt}>
                  {it.meta?.prompt || it.name}
                </div>
                <div className="flex items-center justify-between text-[9.5px] mono" style={{ color: "var(--cream-mute)" }}>
                  <span className="flex items-center gap-1">
                    <Clock size={9} />
                    {fmtAgo(it.meta?.createdAt ?? it.mtime)}
                  </span>
                  {it.meta?.voice && <span>· {it.meta.voice}</span>}
                  {it.meta?.aspectRatio && <span>· {it.meta.aspectRatio}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// SearchHistory — same shape but for saved X-Searches (rows, not a grid, since
// each one is a wall of text).
function SearchHistory({ items, onClick, onDelete }: { items: SavedSearch[]; onClick: (rec: SavedSearch) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 8);
  return (
    <div className="panel p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History size={13} style={{ color: ACCENT }} />
          <div className="action-tag" style={{ color: ACCENT }}>Saved searches</div>
          <span className="text-[10.5px] mono" style={{ color: "var(--cream-mute)" }}>· {items.length} saved</span>
        </div>
        {items.length > 8 && (
          <button onClick={() => setExpanded(!expanded)}
            className="text-[10.5px] uppercase tracking-widest hover:text-[var(--cream)] transition"
            style={{ color: "var(--cream-mute)" }}>
            {expanded ? "Show less" : `Show all ${items.length}`}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-[var(--cream-mute)] italic">
          Run a search — every query you run saves here so you can revisit answers any time.
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map((rec) => (
            <div key={rec.id}
              className="group flex items-start gap-2 p-2.5 rounded-md border transition hover:bg-[rgba(255,255,255,0.02)]"
              style={{ borderColor: "var(--line-soft)" }}>
              <button onClick={() => onClick(rec)} className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Search size={11} style={{ color: ACCENT }} />
                  <span className="text-[12px] text-[var(--cream)] font-medium truncate">{rec.query}</span>
                </div>
                <div className="text-[10.5px] text-[var(--cream-dim)] leading-snug line-clamp-2">
                  {rec.answer.slice(0, 240).replace(/\n+/g, " ")}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] mono" style={{ color: "var(--cream-mute)" }}>
                  <span className="flex items-center gap-1"><Clock size={9} />{fmtAgo(rec.createdAt)}</span>
                  <span>· {rec.citations.length} cites</span>
                  {rec.tookMs && <span>· {(rec.tookMs / 1000).toFixed(1)}s</span>}
                </div>
              </button>
              <button onClick={() => onDelete(rec.id)}
                className="opacity-0 group-hover:opacity-100 transition text-[10px] uppercase tracking-widest hover:text-[var(--plum)]"
                style={{ color: "var(--cream-mute)" }}
                title="Delete this saved search">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
