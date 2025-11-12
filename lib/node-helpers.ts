import { NodeType } from "./types";

export interface NodeOutputHandle {
  id: string;
  label: string;
  edgeLabel: string;
  value?: string;
}

export const parseSwitchCases = (config?: Record<string, unknown>): string[] => {
  const rawCases = typeof config?.cases === "string" ? config?.cases : "";

  return rawCases
    .split("\n")
    .map((value) => value.trim())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
};

export const getNodeOutputHandles = (
  type: NodeType,
  config?: Record<string, unknown>
): NodeOutputHandle[] | null => {
  switch (type) {
    case "ifElse":
      return [
        { id: "true", label: "True", edgeLabel: "True" },
        { id: "false", label: "False", edgeLabel: "False" },
      ];

    case "switch":
      const cases = parseSwitchCases(config);
      const caseHandles = cases.map((value, index) => ({
        id: `case_${index}`,
        label: value,
        edgeLabel: `Case: ${value}`,
        value,
      }));

      return [
        ...caseHandles,
        { id: "default", label: "Default", edgeLabel: "Default" },
      ];

    default:
      return null;
  }
};

