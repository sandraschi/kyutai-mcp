import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { LogEntry } from "../shell/LoggerPanel";

type LogContextValue = {
  logs: LogEntry[];
  append: (entry: LogEntry) => void;
  clear: () => void;
};

const LogContext = createContext<LogContextValue | null>(null);

const MAX_ENTRIES = 2000;

export function LogProvider(props: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const append = useCallback((entry: LogEntry) => {
    setLogs((xs) => xs.concat(entry).slice(-MAX_ENTRIES));
  }, []);

  const clear = useCallback(() => setLogs([]), []);

  const value = useMemo(
    () => ({
      logs,
      append,
      clear
    }),
    [logs, append, clear]
  );

  return <LogContext.Provider value={value}>{props.children}</LogContext.Provider>;
}

export function useLogs(): LogContextValue {
  const ctx = useContext(LogContext);
  if (!ctx) {
    throw new Error("useLogs must be used within LogProvider");
  }
  return ctx;
}
