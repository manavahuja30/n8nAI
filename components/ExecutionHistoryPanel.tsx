import React, { useEffect, useState } from "react";
import {
  Clock, 
  CheckCircle, 
  XCircle, 
  Trash2, 
  ChevronDown, 
  ChevronRight,
  AlertCircle,
  Loader2,
  X
} from "lucide-react";
import {
  clearExecutionHistory,
  deleteExecutionLog,
  EXECUTION_HISTORY_UPDATED_EVENT,
  ExecutionLog,
  formatDuration,
  formatTimestamp,
  getExecutionHistory,
} from "@/lib/execution-history";

interface ExecutionHistoryPanelProps {
  onClose: () => void;
}

export default function ExecutionHistoryPanel({ onClose }: ExecutionHistoryPanelProps) {
  const [history, setHistory] = useState<ExecutionLog[]>(() => getExecutionHistory());
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleUpdate = () => setHistory(getExecutionHistory());

    if (typeof window !== "undefined") {
      window.addEventListener(EXECUTION_HISTORY_UPDATED_EVENT, handleUpdate);
      window.addEventListener("storage", handleUpdate);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(EXECUTION_HISTORY_UPDATED_EVENT, handleUpdate);
        window.removeEventListener("storage", handleUpdate);
      }
    };
  }, []);

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear all execution history?")) {
      clearExecutionHistory();
      setHistory([]);
      setExpandedLogs(new Set());
    }
  };

  const handleDeleteLog = (id: string) => {
    deleteExecutionLog(id);
    setHistory(getExecutionHistory());
    setExpandedLogs((prev) => {
      if (!prev.has(id)) return prev;
      const updated = new Set(prev);
      updated.delete(id);
      return updated;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedLogs((prev) => {
      const updated = new Set(prev);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      return updated;
    });
  };

  const getStatusIcon = (status: ExecutionLog["status"]) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[600px] bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 z-50 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Execution History
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {history.length} execution{history.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 p-2 rounded"
              title="Clear all history"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-2 rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {history.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No execution history yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              Run your workflow to see execution logs here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((log) => (
              <div
                key={log.id}
                className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* Log Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {getStatusIcon(log.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            Workflow Execution
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            log.status === 'success' 
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : log.status === 'error'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}>
                            {log.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                          <span>{formatTimestamp(log.timestamp)}</span>
                          <span>•</span>
                          <span>{formatDuration(log.duration)}</span>
                          <span>•</span>
                          <span>{log.nodesExecuted}/{log.totalNodes} nodes</span>
                        </div>
                        {log.errorMessage && (
                          <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                            {log.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <button
                        onClick={() => toggleExpand(log.id)}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
                      >
                        {expandedLogs.has(log.id) ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedLogs.has(log.id) && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                      Node Execution Details
                    </h4>
                    <div className="space-y-3">
                      {log.results.map((result) => (
                        <div
                          key={result.nodeId}
                          className="p-3 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {result.status === 'success' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : result.status === 'error' ? (
                                <XCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-gray-400" />
                              )}
                              <span className="font-medium text-sm text-gray-900 dark:text-white">
                                {result.nodeName}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDuration(result.duration)}
                            </span>
                          </div>
                          
                          {typeof result.error === "string" && result.error.trim() !== "" && (
                            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 dark:text-red-400">
                              {result.error}
                            </div>
                          )}
                          
                          {typeof result.output !== "undefined" && (
                            <details className="mt-2">
                              <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-gray-200">
                                View output
                              </summary>
                              <pre className="mt-2 text-xs bg-white dark:bg-gray-950 p-2 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto">
                                {JSON.stringify(result.output, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}