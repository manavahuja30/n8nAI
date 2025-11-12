import { Node, Edge } from "reactflow";

export type NodeType =
  | "webhook"
  | "schedule"
  | "aiTextGenerator"
  | "aiAnalyzer"
  | "aiChatbot"
  | "aiDataExtractor"
  | "httpRequest"
  | "dataTransform"
  | "sendEmail"
  | "ifElse"
  | "delay";

export interface NodeData {
  label: string;
  type: NodeType;
  config?: Record<string, any>;
  output?: any;
  isExecuting?: boolean;
  error?: string;
}

export interface WorkflowNode extends Node {
  data: NodeData;
}

export type WorkflowEdge = Edge;

export interface SavedWorkflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  timestamp: number;
}

export interface WorkflowSnapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  history: WorkflowSnapshot[];
  historyIndex: number;
  addNode: (node: WorkflowNode) => void;
  updateNode: (id: string, data: Partial<NodeData>) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: WorkflowEdge) => void;
  deleteEdge: (id: string) => void;
  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: WorkflowEdge[]) => void;
  clearWorkflow: () => void;
  duplicateNode: (id: string) => void;
  saveWorkflow: (name: string) => string;
  loadWorkflow: (id: string) => void;
  getSavedWorkflows: () => SavedWorkflow[];
  deleteSavedWorkflow: (id: string) => void;
  exportWorkflow: () => string;
  importWorkflow: (json: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  saveToHistory: () => void;
}

export interface NodeExecutionContext {
  nodeId: string;
  input: any;
  config: Record<string, any>;
  previousNodes: Record<string, any>;
}

export interface NodeExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
}