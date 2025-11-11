"use client";

import React from "react";
import { nodeDefinitions, NodeDefinition } from "@/lib/node-definitions";
import { Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useWorkflowStore } from "@/lib/store";

interface SidebarProps {
  onExecute: () => void;
  isExecuting: boolean;
}

export default function Sidebar({ onExecute, isExecuting }: SidebarProps) {
  const { clearWorkflow } = useWorkflowStore();

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

        <div className="flex gap-2">
          <Button onClick={onExecute} disabled={isExecuting} className="flex-1">
            <Play className="mr-2 h-4 w-4" />
            {isExecuting ? "Running..." : "Execute"}
          </Button>

          <Button onClick={clearWorkflow} variant="outline">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

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