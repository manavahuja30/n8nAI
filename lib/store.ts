import { create } from "zustand";
import { WorkflowState, WorkflowNode, WorkflowEdge, SavedWorkflow, WorkflowSnapshot } from "./types";
import { addEdge as addReactFlowEdge, Connection } from "reactflow";

const STORAGE_KEY = "n8n-workflows";
const MAX_HISTORY = 50;

const createSnapshot = (nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowSnapshot => ({
  nodes: JSON.parse(JSON.stringify(nodes)),
  edges: JSON.parse(JSON.stringify(edges)),
});

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  history: [],
  historyIndex: -1,

  saveToHistory: () => {
    const state = get();
    const snapshot = createSnapshot(state.nodes, state.edges);
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(snapshot);
    
    // Limit history size
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    } else {
      set({ historyIndex: state.historyIndex + 1 });
    }
    
    set({ history: newHistory });
  },

  addNode: (node: WorkflowNode) => {
    get().saveToHistory();
    set((state) => ({
      nodes: [...state.nodes, node],
    }));
  },

  updateNode: (id: string, data: Partial<WorkflowNode["data"]>) => {
    // Don't save to history for execution updates
    if (data.isExecuting !== undefined || data.output !== undefined || data.error !== undefined) {
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...data } } : node
        ),
      }));
      return;
    }
    
    get().saveToHistory();
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node
      ),
    }));
  },

  deleteNode: (id: string) => {
    get().saveToHistory();
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter(
        (edge: WorkflowEdge) => (edge as any).source !== id && (edge as any).target !== id
      ),
    }));
  },

  duplicateNode: (id: string) => {
    get().saveToHistory();
    const node = get().nodes.find((n) => n.id === id);
    if (node) {
      const newNode: WorkflowNode = {
        ...node,
        id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        position: { x: node.position.x + 50, y: node.position.y + 50 },
        data: { ...node.data },
      };
      set((state) => ({
        nodes: [...state.nodes, newNode],
      }));
    }
  },

  addEdge: (edge: WorkflowEdge) => {
    get().saveToHistory();
    set((state) => ({
      edges: addReactFlowEdge(edge as Connection, state.edges),
    }));
  },

  deleteEdge: (id: string) => {
    get().saveToHistory();
    set((state) => ({
      edges: state.edges.filter((edge: WorkflowEdge) => (edge as any).id !== id),
    }));
  },

  setNodes: (nodes: WorkflowNode[]) => {
    get().saveToHistory();
    set({ nodes });
  },

  setEdges: (edges: WorkflowEdge[]) => {
    get().saveToHistory();
    set({ edges: edges as any });
  },

  clearWorkflow: () => {
    get().saveToHistory();
    set({ nodes: [], edges: [] });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
      const snapshot = state.history[newIndex];
      set({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        historyIndex: newIndex,
      });
    }
  },

  redo: () => {
    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1;
      const snapshot = state.history[newIndex];
      set({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        historyIndex: newIndex,
      });
    }
  },

  canUndo: () => {
    return get().historyIndex > 0;
  },

  canRedo: () => {
    const state = get();
    return state.historyIndex < state.history.length - 1;
  },

  saveWorkflow: (name: string) => {
    const state = get();
    const workflows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const id = `workflow-${Date.now()}`;
    const workflow: SavedWorkflow = {
      id,
      name,
      nodes: state.nodes,
      edges: state.edges,
      timestamp: Date.now(),
    };
    workflows.push(workflow);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
    return id;
  },

  loadWorkflow: (id: string) => {
    const workflows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const workflow = workflows.find((w: SavedWorkflow) => w.id === id);
    if (workflow) {
      get().saveToHistory();
      set({ nodes: workflow.nodes, edges: workflow.edges });
    }
  },

  getSavedWorkflows: () => {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  },

  deleteSavedWorkflow: (id: string) => {
    const workflows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const filtered = workflows.filter((w: SavedWorkflow) => w.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  },

  exportWorkflow: () => {
    const state = get();
    return JSON.stringify(
      {
        nodes: state.nodes,
        edges: state.edges,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  },

  importWorkflow: (json: string) => {
    try {
      const data = JSON.parse(json);
      if (data.nodes && data.edges) {
        get().saveToHistory();
        set({ nodes: data.nodes, edges: data.edges });
      }
    } catch (error) {
      throw new Error("Invalid workflow JSON");
    }
  },
}));