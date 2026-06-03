"use client";

import { useEffect, useState } from "react";
import { Cpu, MessageSquare, Terminal, Layers, Target } from "lucide-react";
import AgentRoom from "@/components/AgentRoom";
import UnifiedChat from "@/components/UnifiedChat";
import HermesWorkspace from "@/components/HermesWorkspace";
import HermesGoals from "@/components/HermesGoals";

type HermesTab = "chat" | "goals" | "workspace" | "control";
interface HmVitals { ok: boolean; model: string; provider: string; }

export default function HermesRoute() {
  const [tab, setTab] = useState<HermesTab>("chat");
  const [v, setV] = useState<HmVitals | null>(null);

  useEffect(() => {
    let stop = false;
    const fetchIt = async () => {
      try {
        const r = await fetch("/api/vitals", { cache: "no-store" });
        const j = await r.json();
        if (!stop) setV(j.hermes);
      } catch { /* ignore */ }
    };
    fetchIt();
    const t = setInterval(fetchIt, 8000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        {([
          { key: "chat",      label: "Chat",         icon: <MessageSquare size={14} /> },
          { key: "goals",     label: "Goal Mode",    icon: <Target size={14} /> },
          { key: "workspace", label: "Workspace",    icon: <Layers size={14} /> },
          { key: "control",   label: "Control Room", icon: <Terminal size={14} /> },
        ] as { key: HermesTab; label: string; icon: React.ReactNode }[]).map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12.5px] transition"
              style={{
                background: active ? "rgba(96,165,250,0.16)" : "transparent",
                borderColor: active ? "#60a5fa" : "var(--panel-border)",
                color: active ? "var(--fg)" : "var(--fg-dim)",
              }}
            >
              {t.icon}{t.label}
            </button>
          );
        })}
      </div>

      {tab === "chat" ? (
        <UnifiedChat defaultAgent="hermes" showAgentSwitcher={false} />
      ) : tab === "goals" ? (
        <HermesGoals />
      ) : tab === "workspace" ? (
        <HermesWorkspace />
      ) : (
        <AgentRoom
          agent="hermes"
          accent="#60a5fa"
          accentDim="rgba(96,165,250,0.12)"
          defaultTab="status"
          tabs={[
            { key: "status",   label: "Status",   action: "status",   hint: "env" },
            { key: "sessions", label: "Sessions", action: "sessions", hint: "history" },
            { key: "skills",   label: "Skills",   action: "skills",   hint: "installed" },
            { key: "plugins",  label: "Plugins",  action: "plugins",  hint: "marketplace" },
            { key: "kanban",   label: "Kanban",   action: "kanban",   hint: "tasks" },
            { key: "doctor",   label: "Doctor",   action: "doctor",   hint: "check" },
            { key: "insights", label: "Insights", action: "insights", hint: "analytics" },
          ]}
          vitals={
            v ? (
              <div className="panel p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid place-items-center w-10 h-10 rounded-xl"
                    style={{ background: "rgba(96,165,250,0.18)", color: "#60a5fa", boxShadow: "0 0 22px -8px #60a5fa" }}>
                    <Cpu size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--fg-dimmer)]">State</div>
                    <div className="text-sm font-medium" style={{ color: "#60a5fa" }}>{v.ok ? "Online" : "Offline"}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--panel-border)] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--fg-dimmer)]">Model</div>
                  <div className="metric text-sm truncate">{v.model}</div>
                </div>
                <div className="rounded-lg border border-[var(--panel-border)] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--fg-dimmer)]">Provider</div>
                  <div className="metric text-sm truncate">{v.provider}</div>
                </div>
              </div>
            ) : null
          }
        />
      )}
    </div>
  );
}
