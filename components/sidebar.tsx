"use client";

import React, { useState, useEffect } from "react";
import { nodeDefinitions, NodeDefinition } from "@/lib/node-definitions";
import { Play, Trash2, Save, FolderOpen, Download, Upload, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useWorkflowStore } from "@/lib/store";

interface SidebarProps {
  onExecute: () => void;
  isExecuting: boolean;
}

export default function Sidebar({ onExecute, isExecuting }: SidebarProps) {
  const {
    clearWorkflow,
    saveWorkflow,
    loadWorkflow,
    getSavedWorkflows,
    deleteSavedWorkflow,
    exportWorkflow,
    importWorkflow,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useWorkflowStore();

  const [savedWorkflows, setSavedWorkflows] = useState<any[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  useEffect(() => {
    setSavedWorkflows(getSavedWorkflows());
  }, [getSavedWorkflows]);

  const handleSave = () => {
    if (workflowName.trim()) {
      saveWorkflow(workflowName.trim());
      setSavedWorkflows(getSavedWorkflows());
      setShowSaveDialog(false);
      setWorkflowName("");
      alert("Workflow saved successfully!");
    }
  };

  const handleLoad = (id: string) => {
    loadWorkflow(id);
    setShowLoadDialog(false);
    setSavedWorkflows(getSavedWorkflows());
  };

  const handleDeleteSaved = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Delete this saved workflow?")) {
      deleteSavedWorkflow(id);
      setSavedWorkflows(getSavedWorkflows());
    }
  };

  const handleExport = () => {
    const json = exportWorkflow();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workflow-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            importWorkflow(event.target?.result as string);
            setSavedWorkflows(getSavedWorkflows());
            alert("Workflow imported successfully!");
          } catch (error: any) {
            alert(`Error importing workflow: ${error.message}`);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const categories = {
    trigger: "Trigger Nodes",
    ai: "AI Nodes",
    action: "Action Nodes",
    logic: "Logic Nodes",
  };

  const groupedNodes = Object.values(nodeDefinitions).reduce((acc, node) => {
    if (!acc[node.category]) {
      acc[node.category] = [];
    }
    acc[node.category].push(node);
    return acc;
  }, {} as Record<string, NodeDefinition[]>);

  return (
    <div className="w-80 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4 overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
          n8n Library
        </h2>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Button onClick={onExecute} disabled={isExecuting} className="flex-1">
              <Play className="mr-2 h-4 w-4" />
              {isExecuting ? "Running..." : "Execute"}
            </Button>
            <Button onClick={clearWorkflow} variant="outline" title="Clear workflow">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={undo}
              disabled={!canUndo()}
              variant="outline"
              size="sm"
              className="flex-1"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              onClick={redo}
              disabled={!canRedo()}
              variant="outline"
              size="sm"
              className="flex-1"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => setShowSaveDialog(true)}
              variant="outline"
              size="sm"
              title="Save workflow"
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
            <Button
              onClick={() => setShowLoadDialog(true)}
              variant="outline"
              size="sm"
              title="Load workflow"
            >
              <FolderOpen className="h-4 w-4 mr-1" />
              Load
            </Button>
            <Button
              onClick={handleExport}
              variant="outline"
              size="sm"
              title="Export workflow"
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button
              onClick={handleImport}
              variant="outline"
              size="sm"
              title="Import workflow"
            >
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
          </div>
        </div>
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Save Workflow
            </h3>
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="Enter workflow name..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white mb-4"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setShowSaveDialog(false);
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1" disabled={!workflowName.trim()}>
                Save
              </Button>
              <Button
                onClick={() => {
                  setShowSaveDialog(false);
                  setWorkflowName("");
                }}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {showLoadDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-96 max-h-96 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Load Workflow
            </h3>
            {savedWorkflows.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No saved workflows found.
              </p>
            ) : (
              <div className="space-y-2">
                {savedWorkflows.map((workflow: any) => (
                  <div
                    key={workflow.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => handleLoad(workflow.id)}
                  >
                    <div>
                      <div className="font-medium text-sm text-gray-900 dark:text-white">
                        {workflow.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(workflow.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSaved(workflow.id, e)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button
              onClick={() => setShowLoadDialog(false)}
              variant="outline"
              className="w-full mt-4"
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {Object.entries(categories).map(([category, title]) => (
        <div key={category} className="mb-6">
          <h3 className="text-sm font-semibold mb-3 text-gray-600 dark:text-gray-400 uppercase tracking-wider">
            {title}
          </h3>

          <div className="space-y-2">
            {groupedNodes[category]?.map((node) => (
              <div
                key={node.type}
                draggable
                onDragStart={(event) => onDragStart(event, node.type)}
                className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-move hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className={`${node.color} p-2 rounded-md`}>
                    <node.icon className="h-4 w-4 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 dark:text-white">
                      {node.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {node.description}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-800 dark:text-blue-200">
          <strong>Tip:</strong> Drag nodes onto the canvas and connect them to
          create workflows. AI nodes require Gemini API key (GEMINI_OPENAI_API_KEY) in .env
          file.
        </p>
      </div>
    </div>
  );
}