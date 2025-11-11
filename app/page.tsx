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
  Edge,
} from "reactflow";
import "reactflow/dist/style.css";

import Sidebar from "@/components/sidebar";
import customNode from "@/components/customNode";
import NodeConfigPanel from "@/components/NodeConfigPanel";
import { useWorkflowStore } from "@/lib/store";
import { nodeDefinitions } from "@/lib/node-definitions";
import { WorkflowNode, NodeData } from "@/lib/types";
import { WorkflowExecutor } from "@/lib/executor";

const nodeTypes: NodeTypes = {
  custom: customNode,
};

let nodeIdCounter = 0;

export default function Home() {
  const { nodes, edges, addNode, addEdge, updateNode, setNodes, setEdges } =
    useWorkflowStore();
  const [, , onNodesChange] = useNodesState([]);
  const [, , onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const edge = {
        ...connection,
        id: `e${connection.source}-${connection.target}`,
        type: "smoothstep",
        animated: true,
      };
      addEdge(edge as any);
    },
    [addEdge]
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

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: any) => {
      setSelectedNodeId(node.id);
    },
    []
  );

  const executeWorkflow = async () => {
    if (nodes.length === 0) {
      alert("Add some nodes to the canvas first!");
      return;
    }

    setIsExecuting(true);
    const executor = new WorkflowExecutor();

    // Find trigger nodes (nodes with no incoming edges)
    const triggerNodes = nodes.filter(
      (node) => !edges.some((edge: any) => edge.target === node.id)
    );

    if (triggerNodes.length === 0) {
      alert("Add a trigger node to start the workflow!");
      setIsExecuting(false);
      return;
    }

    // Reset all nodes
    nodes.forEach((node) => {
      updateNode(node.id, {
        output: undefined,
        error: undefined,
        isExecuting: false,
      });
    });

    // Execute nodes in order
    const executedNodes = new Set<string>();
    const nodeOutputs: Record<string, any> = {};

    const executeNodeChain = async (nodeId: string, input: any = null) => {
      if (executedNodes.has(nodeId)) return;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      executedNodes.add(nodeId);
      updateNode(nodeId, { isExecuting: true, error: undefined });

      try {
        const result = await executor.executeNode({
          nodeId: node.id,
          input,
          config: node.data.config || {},
          previousNodes: nodeOutputs,
        });

        if (result.success) {
          updateNode(nodeId, {
            output: result.output,
            isExecuting: false,
          });
          nodeOutputs[nodeId] = result.output;

          // Find and execute connected nodes
          const connectedEdges = edges.filter((edge: any) => (edge as any).source === nodeId);
          for (const edge of connectedEdges) {
            await executeNodeChain((edge as any).target, result.output);
          }
        } else {
          updateNode(nodeId, {
            error: result.error,
            isExecuting: false,
          });
        }
      } catch (error: any) {
        updateNode(nodeId, {
          error: error.message || "Execution failed",
          isExecuting: false,
        });
      }
    };

    // Execute from each trigger
    for (const triggerNode of triggerNodes) {
      await executeNodeChain(triggerNode.id);
    }

    setIsExecuting(false);
  };

  return (
    <div className="flex h-screen w-screen bg-gray-100 dark:bg-gray-950">
      <Sidebar onExecute={executeWorkflow} isExecuting={isExecuting} />

      <div className="flex-1" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges as Edge[]}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeDoubleClick={onNodeDoubleClick}
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
    </div>
  );
}