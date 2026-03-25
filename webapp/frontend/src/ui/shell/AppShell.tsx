import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  Bot,
  Gauge,
  HelpCircle,
  LayoutGrid,
  Logs,
  Mic2,
  PlayCircle,
  ScrollText,
  Settings,
  Wrench
} from "lucide-react";
import { useLogs } from "../log/LogContext";
import { cn } from "../cn";
import { LoggerPanel } from "./LoggerPanel";
import { ChatModal } from "./ChatModal";

type NavItem = {
  to: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
};

const ROUTE_TITLES: Record<string, string> = {
  "/": "Home",
  "/actions": "Actions",
  "/tools": "Tools",
  "/apps": "Apps",
  "/moshi": "Talk with Moshi",
  "/talk": "Talk with Moshi",
  "/status": "Status",
  "/chat": "Chat",
  "/logs": "Logger",
  "/settings": "Settings",
  "/help": "Help"
};

const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: (p) => <Gauge {...p} /> },
  { to: "/actions", label: "Actions", icon: (p) => <PlayCircle {...p} /> },
  { to: "/tools", label: "Tools", icon: (p) => <Wrench {...p} /> },
  { to: "/apps", label: "Apps", icon: (p) => <LayoutGrid {...p} /> },
  { to: "/moshi", label: "Moshi", icon: (p) => <Mic2 {...p} /> },
  { to: "/status", label: "Status", icon: (p) => <Activity {...p} /> },
  { to: "/chat", label: "Chat", icon: (p) => <Bot {...p} /> },
  { to: "/logs", label: "Logger", icon: (p) => <ScrollText {...p} /> },
  { to: "/settings", label: "Settings", icon: (p) => <Settings {...p} /> },
  { to: "/help", label: "Help", icon: (p) => <HelpCircle {...p} /> }
];

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem("sidebarCollapsed") === "1";
  } catch {
    return false;
  }
}

export function AppShell(props: { children: React.ReactNode }) {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
  const { logs, append, clear } = useLogs();
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("sidebarCollapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setChatOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pageTitle = useMemo(() => {
    const hit = NAV.find((n) => n.to === location.pathname);
    if (hit) return hit.label;
    return ROUTE_TITLES[location.pathname] ?? "Not found";
  }, [location.pathname]);

  const isMoshiTalkPath = location.pathname === "/moshi" || location.pathname === "/talk";

  return (
    <div className="h-dvh w-full overflow-hidden bg-slate-950 text-slate-100">
      <div className="flex h-full">
        <aside
          className={cn(
            "z-40 flex h-full flex-col border-r border-white/10 bg-slate-950/60 backdrop-blur",
            sidebarCollapsed ? "w-[72px]" : "w-[260px]"
          )}
        >
          <div className="flex items-center justify-between px-4 py-4">
            <div className={cn("font-semibold tracking-wide", sidebarCollapsed && "sr-only")}>
              kyutai-mcp
            </div>
            <button
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
              onClick={() => setSidebarCollapsed((v) => !v)}
              type="button"
              aria-label="Toggle sidebar"
            >
              <Logs className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 px-2">
            {NAV.map((item) => {
              const active =
                item.to === "/moshi" ? isMoshiTalkPath : location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                    active ? "bg-amber-400/10 text-amber-200" : "text-slate-200 hover:bg-white/5"
                  )}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center">
                    {item.icon({ className: "h-5 w-5" })}
                  </span>
                  <span className={cn(sidebarCollapsed && "sr-only")}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-3">
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10",
                sidebarCollapsed && "px-2"
              )}
              onClick={() => setChatOpen(true)}
            >
              <Bot className="h-4 w-4" />
              <span className={cn(sidebarCollapsed && "sr-only")}>Chat</span>
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="z-30 flex h-14 items-center justify-between border-b border-white/10 bg-slate-950/60 px-6 backdrop-blur">
            <div className="min-w-0">
              <div className="truncate text-sm text-slate-400">kyutai-mcp</div>
              {location.pathname !== "/" ? (
                <div className="truncate text-xs text-slate-500">Home · {pageTitle}</div>
              ) : null}
              <div className="truncate text-lg font-semibold">{pageTitle}</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-200">
                Web substrate
              </span>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-auto p-6">{props.children}</main>

          <LoggerPanel logs={logs} onClear={clear} />

          <ChatModal open={chatOpen} onOpenChange={setChatOpen} onLog={append} />
        </div>
      </div>
    </div>
  );
}

