
"use client";

import React, { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { nodeDefinitions } from "@/lib/node-definitions";
import { WorkflowNode } from "@/lib/types";
import { Settings, CheckCircle, AlertCircle, Loader2, X } from "lucide-react";
import { useWorkflowStore } from "@/lib/store";
import { getNodeOutputHandles } from "@/lib/node-helpers";

function CustomNode({ data, id, selected }: NodeProps<WorkflowNode["data"]>) {
  const definition = nodeDefinitions[data.type];
  const { deleteNode } = useWorkflowStore();

  if (!definition) return null;

  const Icon = definition.icon;
  const showInput = definition.category !== "trigger";

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this node?")) {
      deleteNode(id);
    }
  };

  const outputHandles = getNodeOutputHandles(data.type, data.config);

  return (
    <div
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg shadow-lg border-2 transition-all
        ${selected ? "border-blue-500" : "border-gray-200 dark:border-gray-700"}
        ${data.isExecuting ? "ring-2 ring-blue-400" : ""}
        ${data.error ? "ring-2 ring-red-400" : ""}
        min-w-[200px]
      `}
    >
      {/* Input Handle */}
      {showInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-3! h-3! bg-blue-500! border-2! border-white!"
        />
      )}

      {/* Node Header */}
      <div
        className={`${definition.color} p-3 rounded-t-lg flex items-center gap-2 relative`}
      >
        <Icon className="h-5 w-5 text-white" />
        <span className="font-semibold text-white text-sm flex-1">
          {definition.label}
        </span>

        <div className="flex items-center gap-1">
          {data.isExecuting && (
            <Loader2 className="h-4 w-4 text-white animate-spin" />
          )}
          {data.output && !data.isExecuting && !data.error && (
            <CheckCircle className="h-4 w-4 text-white" />
          )}
          {data.error && <AlertCircle className="h-4 w-4 text-white" />}
          
          <button
            onClick={handleDelete}
            className="ml-1 p-1 rounded hover:bg-white/20 transition-colors opacity-80 hover:opacity-100"
            title="Delete node"
            type="button"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>

      {/* Node Body */}
      <div className="p-3">
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          {definition.description}
        </div>

        {data.config && Object.keys(data.config).length > 0 && (
          <div className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <Settings className="h-3 w-3" />
              <span>Configured</span>
            </div>
          </div>
        )}

        {data.error && (
          <div className="mt-2 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-2 rounded border border-red-200 dark:border-red-800">
            {data.error}
          </div>
        )}

        {data.output && !data.error && (
          <div className="mt-2 text-xs bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-2 rounded border border-green-200 dark:border-green-800">
            ✓ Executed successfully
          </div>
        )}
      </div>

      {/* Output Handles */}
      {outputHandles ? (
        <div className="absolute inset-y-0 right-0 flex flex-col justify-center gap-2 pr-1">
          {outputHandles.map((handle) => (
            <div
              key={handle.id}
              className="flex items-center justify-end"
            >
              <Handle
                id={handle.id}
                type="source"
                position={Position.Right}
                className="w-3! h-3! bg-blue-500! border-2! border-white!"
              />
            </div>
          ))}
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="w-3! h-3! bg-blue-500! border-2! border-white!"
        />
      )}
    </div>
  );
}

export default memo(CustomNode);
