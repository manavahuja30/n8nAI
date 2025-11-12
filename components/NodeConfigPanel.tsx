
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWorkflowStore } from "@/lib/store";
import { nodeDefinitions } from "@/lib/node-definitions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { X } from "lucide-react";

const MAX_VARIABLE_DEPTH = 4;

interface VariableSuggestion {
  token: string;
  description: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const formatPreview = (value: unknown) => {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return value.length > 30 ? `${value.slice(0, 27)}…` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
};

const collectFieldSuggestions = (
  nodeId: string,
  data: unknown,
  depth = 0
): VariableSuggestion[] => {
  if (data === undefined || data === null || depth > MAX_VARIABLE_DEPTH) {
    return [];
  }

  const suggestions: VariableSuggestion[] = [];

  const walk = (value: unknown, path: string[], currentDepth: number) => {
    if (value === undefined || value === null) {
      return;
    }

    if (currentDepth > MAX_VARIABLE_DEPTH) {
      return;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      const joinedPath = path.join(".");
      suggestions.push({
        token: `{{${nodeId}${joinedPath ? `.${joinedPath}` : ""}}}`,
        description: `${joinedPath || "value"} → ${formatPreview(value)}`,
      });
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        walk(item, [...path, String(index)], currentDepth + 1);
      });
      return;
    }

    if (isPlainObject(value)) {
      Object.entries(value).forEach(([key, nested]) => {
        walk(nested, [...path, key], currentDepth + 1);
      });
    }
  };

  walk(data, [], depth);
  return suggestions;
};

interface NodeConfigPanelProps {
  nodeId: string;
  onClose: () => void;
}

export default function NodeConfigPanel({
  nodeId,
  onClose,
}: NodeConfigPanelProps) {
  const { nodes, edges, updateNode } = useWorkflowStore();
  const node = nodes.find((n) => n.id === nodeId);

  const [config, setConfig] = useState<Record<string, unknown>>(
    node?.data.config || {}
  );

  useEffect(() => {
    if (node?.data.config) {
      setConfig(node.data.config);
    }
  }, [node]);

  const availableVariableNodes = useMemo(
    () => nodes.filter((n) => n.id !== nodeId),
    [nodes, nodeId]
  );

  const inputEdges = useMemo(
    () => edges.filter((edge) => edge.target === nodeId),
    [edges, nodeId]
  );

  const inputData = useMemo(
    () =>
      inputEdges.map((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        return {
          id: sourceNode?.id ?? edge.source,
          label: sourceNode?.data.label || sourceNode?.id || edge.source,
          data: sourceNode?.data.output,
        };
      }),
    [inputEdges, nodes]
  );

  const variableSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const suggestions: VariableSuggestion[] = [
      { token: "{{input}}", description: "Entire input payload" },
      {
        token: "{{input.field}}",
        description: "Specific field from current node input (replace field)",
      },
    ];

    availableVariableNodes.forEach((item) => {
      const label = item.data?.label || item.id;
      const baseToken = `{{${item.id}}}`;
      if (!seen.has(baseToken)) {
        suggestions.push({
          token: baseToken,
          description: `Output of ${label}`,
        });
        seen.add(baseToken);
      }
    });

    inputData.forEach(({ id, label, data }) => {
      const baseToken = `{{${id}}}`;
      if (!seen.has(baseToken)) {
        suggestions.push({
          token: baseToken,
          description: `Output of ${label}`,
        });
        seen.add(baseToken);
      }

      collectFieldSuggestions(id, data).forEach((suggestion) => {
        if (!seen.has(suggestion.token)) {
          suggestions.push({
            token: suggestion.token,
            description: `${label}: ${suggestion.description}`,
          });
          seen.add(suggestion.token);
        }
      });
    });

    return suggestions;
  }, [availableVariableNodes, inputData]);

  const fieldRefs = useRef<
    Record<string, HTMLInputElement | HTMLTextAreaElement | null>
  >({});

  const setInputRef =
    (name: string) =>
    (element: HTMLInputElement | null) => {
      fieldRefs.current[name] = element;
    };

  const setTextareaRef =
    (name: string) =>
    (element: HTMLTextAreaElement | null) => {
      fieldRefs.current[name] = element;
    };

  const getFieldValue = (name: string, defaultValue?: unknown) => {
    const currentValue = config[name];
    const value = currentValue ?? defaultValue ?? "";
    return typeof value === "string" ? value : String(value);
  };

  const supportsVariables = (type: string) =>
    type === "text" || type === "textarea" || type === "number";

  if (!node) return null;

  const definition = nodeDefinitions[node.data.type];
  if (!definition) return null;

  const handleSave = () => {
    updateNode(nodeId, { config });
    onClose();
  };

  const handleChange = (name: string, value: string) => {
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handleInsertVariable = (name: string, token: string) => {
    const element = fieldRefs.current[name];
    if (!element) {
      return;
    }

    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    const newValue = `${element.value.slice(0, start)}${token}${element.value.slice(end)}`;

    element.value = newValue;
    element.focus();
    const caret = start + token.length;
    element.setSelectionRange(caret, caret);

    handleChange(name, newValue);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 z-50 overflow-y-auto">
      <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Configure Node
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {definition.label}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Input Preview */}
        {inputData.length > 0 && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">
              Input Data
            </h4>
            {inputData.map((input, idx) => (
              <div key={idx} className="mb-2 last:mb-0">
                <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                  From: {input.label}
                </div>
                {input.data ? (
                  <pre className="text-xs text-blue-800 dark:text-blue-200 overflow-x-auto bg-white dark:bg-gray-900 p-2 rounded border border-blue-200 dark:border-blue-700">
                    {JSON.stringify(input.data, null, 2)}
                  </pre>
                ) : (
                  <div className="text-xs text-blue-600 dark:text-blue-400 italic">
                    No data available (node not executed yet)
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {definition.configFields.map((field) => (
          <div key={field.name}>
            <Label className="text-gray-700 dark:text-gray-300">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>

            {field.type === "text" && (
              <Input
                type="text"
                value={getFieldValue(field.name, field.defaultValue)}
                onChange={(e) => handleChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className="mt-1"
                ref={setInputRef(field.name)}
              />
            )}

            {field.type === "number" && (
              <Input
                type="text"
                inputMode="decimal"
                value={getFieldValue(field.name, field.defaultValue)}
                onChange={(e) => handleChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className="mt-1"
                ref={setInputRef(field.name)}
              />
            )}

            {field.type === "textarea" && (
              <Textarea
                value={getFieldValue(field.name, field.defaultValue)}
                onChange={(e) => handleChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className="mt-1 font-mono text-sm"
                rows={6}
                ref={setTextareaRef(field.name)}
              />
            )}

            {field.type === "select" && (
              <Select
                value={config[field.name] ?? field.defaultValue ?? ""}
                onChange={(e) => handleChange(field.name, e.target.value)}
                className="mt-1"
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}

            {supportsVariables(field.type) && variableSuggestions.length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Insert variable:
                </div>
                <div className="flex flex-wrap gap-2">
                  {variableSuggestions.map(({ token, description }) => (
                    <button
                      key={`${field.name}-${token}`}
                      type="button"
                      onClick={() => handleInsertVariable(field.name, token)}
                      className="px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 transition"
                      title={description}
                    >
                      {token}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
          <Button onClick={handleSave} className="flex-1">
            Save Configuration
          </Button>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
        </div>

        {node.data.output && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Last Output
            </h4>
            <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
              {JSON.stringify(node.data.output, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
