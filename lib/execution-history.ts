import type { JsonValue } from "./types";

export interface ExecutionLog {
  id: string;
  timestamp: number;
  duration: number;
  status: "success" | "error" | "running";
  nodesExecuted: number;
  totalNodes: number;
  results: ExecutionNodeResult[];
  errorMessage?: string;
}

export interface ExecutionNodeResult {
  nodeId: string;
  nodeName: string;
  status: "success" | "error" | "skipped";
  output?: JsonValue;
  error?: string;
  duration: number;
}

export const MAX_EXECUTION_HISTORY = 50;
export const EXECUTION_HISTORY_KEY = "n8n-execution-history";
export const EXECUTION_HISTORY_UPDATED_EVENT = "n8n:execution-history-updated";

function notifyHistoryUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EXECUTION_HISTORY_UPDATED_EVENT));
  }
}

export function saveExecutionLog(log: ExecutionLog) {
  try {
    const history = getExecutionHistory();
    history.unshift(log);

    if (history.length > MAX_EXECUTION_HISTORY) {
      history.splice(MAX_EXECUTION_HISTORY);
    }

    localStorage.setItem(EXECUTION_HISTORY_KEY, JSON.stringify(history));
    notifyHistoryUpdated();
  } catch (error) {
    console.error("Failed to save execution log:", error);
  }
}

export function getExecutionHistory(): ExecutionLog[] {
  try {
    const stored = localStorage.getItem(EXECUTION_HISTORY_KEY);
    return stored ? (JSON.parse(stored) as ExecutionLog[]) : [];
  } catch (error) {
    console.error("Failed to load execution history:", error);
    return [];
  }
}

export function clearExecutionHistory() {
  try {
    localStorage.removeItem(EXECUTION_HISTORY_KEY);
    notifyHistoryUpdated();
  } catch (error) {
    console.error("Failed to clear execution history:", error);
  }
}

export function deleteExecutionLog(id: string) {
  try {
    const history = getExecutionHistory();
    const filtered = history.filter((log) => log.id !== id);
    localStorage.setItem(EXECUTION_HISTORY_KEY, JSON.stringify(filtered));
    notifyHistoryUpdated();
  } catch (error) {
    console.error("Failed to delete execution log:", error);
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }

  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) {
    return "Just now";
  }

  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  }

  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}