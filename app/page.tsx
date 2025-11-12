"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  NodeTypes,
  OnConnect,
  OnNodesChange,
  OnEdgesChange,
  Panel,
} from "reactflow";
import "reactflow/dist/style.css";

import Sidebar from "@/components/sidebar";
import customNode from "@/components/customNode";
import NodeConfigPanel from "@/components/NodeConfigPanel";
import { useWorkflowStore } from "@/lib/store";
import { nodeDefinitions } from "@/lib/node-definitions";
import {
  WorkflowNode,
  NodeData,
  WorkflowEdge,
} from "@/lib/types";
import { WorkflowExecutor } from "@/lib/executor";
import ExecutionHistoryPanel from "@/components/ExecutionHistoryPanel";
import { 
  saveExecutionLog, 
  ExecutionLog, 
  ExecutionNodeResult 
} from "@/lib/execution-history";
import { getNodeOutputHandles } from "@/lib/node-helpers";

const nodeTypes: NodeTypes = {
  custom: customNode,
};

let nodeIdCounter = 0;

export default function Home() {
  const {
    nodes,
    edges,
    addNode,
    addEdge,
    updateNode,
    setNodes,
    setEdges,
    deleteNode,
    duplicateNode,
    undo,
    redo,
    canUndo,
    canRedo,
    saveWorkflow,
    exportWorkflow,
    importWorkflow,
  } = useWorkflowStore();
  const [, , onNodesChange] = useNodesState([]);
  const [, , onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }

      const sourceNode = nodes.find((node) => node.id === connection.source);
      const outputHandles = sourceNode
        ? getNodeOutputHandles(sourceNode.data.type, sourceNode.data.config)
        : null;

      const handleMeta = outputHandles?.find(
        (handle) => handle.id === connection.sourceHandle
      );

      const uniqueId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const { source, target, sourceHandle, targetHandle } = connection;

      const edge: WorkflowEdge = {
        source: source!,
        target: target!,
        sourceHandle,
        targetHandle,
        id: `e-${source}-${sourceHandle || "default"}-${target}-${uniqueId}`,
        type: "smoothstep",
        animated: true,
        label: handleMeta?.edgeLabel,
        data: {
          branch: sourceHandle || undefined,
          displayLabel: handleMeta?.edgeLabel,
        },
      };

      addEdge(edge);
    },
    [addEdge, nodes]
  );

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      // Update store with the changes
      changes.forEach((change) => {
        if (change.type === "remove") {
          const { nodes: currentNodes } = useWorkflowStore.getState();
          setNodes(currentNodes.filter((node) => node.id !== change.id));
        } else if (change.type === "position" && "position" in change) {
          const node = nodes.find((n) => n.id === change.id);
          if (node && change.position) {
            const updatedNodes = nodes.map((n) =>
              n.id === change.id ? { ...n, position: change.position! } : n
            );
            setNodes(updatedNodes);
          }
        }
      });
    },
    [nodes, onNodesChange, setNodes]
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      // Update store with the changes
      changes.forEach((change) => {
        if (change.type === "remove") {
          const { edges: currentEdges } = useWorkflowStore.getState();
          setEdges(currentEdges.filter((edge: any) => edge.id !== change.id));
        }
      });
    },
    [onEdgesChange, setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type || !reactFlowInstance) return;

      const definition = nodeDefinitions[type];
      if (!definition) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: WorkflowNode = {
        id: `node-${nodeIdCounter++}`,
        type: "custom",
        position,
        data: {
          label: definition.label,
          type: definition.type,
          config: { ...definition.defaultConfig, type: definition.type },
        } as NodeData,
      };

      addNode(newNode);
    },
    [reactFlowInstance, addNode]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: any) => {
      setSelectedNodeId(node.id);
    },
    []
  );

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: any) => {
      setSelectedNodeId(node.id);
    },
    []
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      });
    },
    []
  );

  const handleDuplicateNode = useCallback(() => {
    if (contextMenu) {
      duplicateNode(contextMenu.nodeId);
      setContextMenu(null);
    }
  }, [contextMenu, duplicateNode]);

  const handleDeleteNode = useCallback(() => {
    if (contextMenu) {
      if (window.confirm("Are you sure you want to delete this node?")) {
        deleteNode(contextMenu.nodeId);
      }
      setContextMenu(null);
    }
  }, [contextMenu, deleteNode]);

  // Initialize history on first load
  useEffect(() => {
    const { saveToHistory, nodes: currentNodes, edges: currentEdges } = useWorkflowStore.getState();
    if (currentNodes.length === 0 && currentEdges.length === 0) {
      saveToHistory();
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        (e.target as HTMLElement).tagName === "INPUT" ||
        (e.target as HTMLElement).tagName === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Delete key - delete selected node
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId) {
          e.preventDefault();
          if (window.confirm("Are you sure you want to delete this node?")) {
            deleteNode(selectedNodeId);
            setSelectedNodeId(null);
          }
        }
      }

      // Ctrl/Cmd + S - Save workflow
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        const name = prompt("Enter workflow name:");
        if (name) {
          saveWorkflow(name);
          alert("Workflow saved successfully!");
        }
      }

      // Ctrl/Cmd + Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          undo();
        }
      }

      // Ctrl/Cmd + Shift + Z - Redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        if (canRedo()) {
          redo();
        }
      }

      // Ctrl/Cmd + E - Export
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        const json = exportWorkflow();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `workflow-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }

      // Ctrl/Cmd + O - Import
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.onchange = (event: any) => {
          const file = event.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                importWorkflow(e.target?.result as string);
                alert("Workflow imported successfully!");
              } catch (error: any) {
                alert(`Error importing workflow: ${error.message}`);
              }
            };
            reader.readAsText(file);
          }
        };
        input.click();
      }

      // Ctrl/Cmd + D - Duplicate selected node
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        if (selectedNodeId) {
          duplicateNode(selectedNodeId);
        }
      }

      // Escape - Close context menu or config panel
      if (e.key === "Escape") {
        setContextMenu(null);
        setSelectedNodeId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedNodeId,
    deleteNode,
    saveWorkflow,
    undo,
    redo,
    canUndo,
    canRedo,
    exportWorkflow,
    importWorkflow,
    duplicateNode,
  ]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
    };
    if (contextMenu) {
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  const executeWorkflow = useCallback(async () => {
    if (!nodes || nodes.length === 0) {
      window.alert("Add some nodes to the canvas first!");
      return;
    }
  
    setIsExecuting(true);

    const executor = new WorkflowExecutor();
    const startTime = Date.now();
    const triggerNodes = nodes.filter(
      (node) => !edges.some((edge: any) => edge.target === node.id)
    );
  
    if (triggerNodes.length === 0) {
      alert("Add a trigger node to start the workflow!");
      setIsExecuting(false);
      return;
    }
    nodes.forEach((node) => {
      updateNode(node.id, {
        output: undefined,
        error: undefined,
        isExecuting: false,
      });
    });

    const executionResults: ExecutionNodeResult[] = [];
    const executedNodes = new Set<string>();
    const nodeOutputs: Record<string, any> = {};
    let hasError = false;
    let errorMessage = "";

    const executeNodeChain = async (nodeId: string, input: any = null) => {
      if (executedNodes.has(nodeId)) return;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      executedNodes.add(nodeId);
      const nodeStartTime = Date.now();
      updateNode(nodeId, { isExecuting: true, error: undefined });

      try {
        const result = await executor.executeNode({
          nodeId: node.id,
          input,
          config: node.data.config || {},
          previousNodes: nodeOutputs,
        });

        const nodeDuration = Date.now() - nodeStartTime;

        if (result.success) {
          updateNode(nodeId, {
            output: result.output,
            isExecuting: false,
          });
          nodeOutputs[nodeId] = result.output;

          executionResults.push({
            nodeId: node.id,
            nodeName: node.data.label,
            status: "success",
            output: result.output,
            duration: nodeDuration,
          });

          const connectedEdges = edges.filter(
            (edge) => edge.source === nodeId
          );

          let edgesToTraverse = connectedEdges;
          const branch = (result.output as any)?.branch;

          if (branch && connectedEdges.length > 0) {
            const branchMatches = connectedEdges.filter(
              (edge) => edge.data?.branch === branch
            );

            if (branchMatches.length > 0) {
              edgesToTraverse = branchMatches;
            } else {
              const defaultEdges = connectedEdges.filter(
                (edge) => edge.data?.branch === "default"
              );

              if (defaultEdges.length > 0) {
                edgesToTraverse = defaultEdges;
              } else {
                const unassignedEdges = connectedEdges.filter(
                  (edge) => !edge.data?.branch
                );

                edgesToTraverse = unassignedEdges;
              }
            }
          }

          for (const edge of edgesToTraverse) {
            await executeNodeChain(edge.target, result.output);
          }
        } else {
          updateNode(nodeId, {
            error: result.error,
            isExecuting: false,
          });

          hasError = true;
          errorMessage = result.error || "Unknown error";
          executionResults.push({
            nodeId: node.id,
            nodeName: node.data.label,
            status: "error",
            error: result.error,
            duration: nodeDuration,
          });
        }
      } catch (error: any) {
        const nodeDuration = Date.now() - nodeStartTime;
        const errorMsg = error.message || "Execution failed";

        updateNode(nodeId, {
          error: errorMsg,
          isExecuting: false,
        });

        hasError = true;
        errorMessage = errorMsg;
        executionResults.push({
          nodeId: node.id,
          nodeName: node.data.label,
          status: "error",
          error: errorMsg,
          duration: nodeDuration,
        });
      }
    };

    for (const triggerNode of triggerNodes) {
      await executeNodeChain(triggerNode.id);
    }

    const totalDuration = Date.now() - startTime;
    setIsExecuting(false);

    const executionLog: ExecutionLog = {
      id: `exec-${Date.now()}`,
      timestamp: startTime,
      duration: totalDuration,
      status: hasError ? "error" : "success",
      nodesExecuted: executedNodes.size,
      totalNodes: nodes.length,
      results: executionResults,
      errorMessage: hasError ? errorMessage : undefined,
    };

    saveExecutionLog(executionLog);
  }, [edges, nodes, updateNode]);
  return (
    <div className="flex h-screen w-screen bg-gray-100 dark:bg-gray-950">
      <Sidebar
        onExecute={executeWorkflow}
        onShowHistory={() => setShowHistoryPanel(true)}
        isExecuting={isExecuting}
      />

      <div className="flex-1" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeContextMenu={onNodeContextMenu}
          nodeTypes={nodeTypes}
          fitView
          className="bg-gray-50 dark:bg-gray-900"
        >
          <Background color="#aaa" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const definition = nodeDefinitions[node.data.type];
              return definition?.color.includes("gradient")
                ? "#8b5cf6"
                : definition?.color.replace("bg-", "") || "#6366f1";
            }}
            className="bg-white dark:bg-gray-800"
          />

          <Panel
            position="top-center"
            className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-white">
                {nodes.length}
              </span>{" "}
              nodes •{" "}
              <span className="font-semibold text-gray-900 dark:text-white">
                {edges.length}
              </span>{" "}
              connections
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {selectedNodeId && (
        <NodeConfigPanel
          nodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
        />
      )}

      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1 min-w-[150px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleDuplicateNode}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <span>📋</span> Duplicate
          </button>
          <button
            onClick={handleDeleteNode}
            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <span>🗑️</span> Delete
          </button>
        </div>
      )}

      {showHistoryPanel && (
        <ExecutionHistoryPanel onClose={() => setShowHistoryPanel(false)} />
      )}
    </div>
  );
}