import { NodeExecutionContext, NodeExecutionResult } from "./types";
import { nodeDefinitions } from "./node-definitions";
import { parseSwitchCases } from "./node-helpers";

interface TemplateContext {
  input: unknown;
  previousNodes: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringifyValue = (value: unknown): string =>
  isRecord(value) ? JSON.stringify(value) : String(value);

const accessValue = (target: unknown, key: string): unknown => {
  if (Array.isArray(target)) {
    const index = Number(key);
    if (Number.isInteger(index)) {
      return target[index];
    }
    return undefined;
  }

  if (isRecord(target)) {
    return target[key];
  }

  return undefined;
};

const resolvePath = (source: unknown, path: string): unknown => {
  if (!path) {
    return source;
  }

  const sanitized = path
    .replace(/\[(\w+)\]/g, ".$1")
    .replace(/^\./, "");

  const segments = sanitized.split(".").filter(Boolean);

  return segments.reduce<unknown>((acc, segment) => {
    if (acc === undefined || acc === null) {
      return undefined;
    }
    return accessValue(acc, segment);
  }, source);
};

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

function replaceTemplateVariables(rawText: unknown, context: TemplateContext): string {
  if (typeof rawText !== "string") {
    return String(rawText ?? "");
  }

  const text = rawText;
  const { input, previousNodes } = context;

  return text.replace(/\{\{([^}]+)\}\}/g, (match, rawPath) => {
    const trimmedPath = rawPath.trim();
    if (!trimmedPath) {
      return match;
    }

    if (trimmedPath === "input") {
      return stringifyValue(input);
    }

    if (trimmedPath.startsWith("input.")) {
      const value = resolvePath(input, trimmedPath.slice(6));
      return value !== undefined && value !== null ? stringifyValue(value) : match;
    }

    const [nodeId, ...rest] = trimmedPath.split(".");
    if (nodeId) {
      const nodeOutput = previousNodes[nodeId];
      if (nodeOutput !== undefined) {
        if (rest.length === 0) {
          return stringifyValue(nodeOutput);
        }
        const value = resolvePath(nodeOutput, rest.join("."));
        return value !== undefined && value !== null ? stringifyValue(value) : match;
      }
    }

    return match;
  });
}

export class WorkflowExecutor {
  private async executeAINode(
    type: string,
    config: Record<string, unknown>,
    context: NodeExecutionContext
  ): Promise<unknown> {
    try {
      const response = await fetch("/api/ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          config,
          input: context.input,
          previousNodes: context.previousNodes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "AI execution failed");
      }

      return await response.json();
    } catch (error: unknown) {
      throw new Error(getErrorMessage(error, "Failed to execute AI node"));
    }
  }

  async executeNode(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const { config } = context;
    const definition = nodeDefinitions[config.type];

    if (!definition) {
      return {
        success: false,
        error: `Unknown node type: ${config.type}`,
      };
    }

    try {
      switch (definition.category) {
        case "trigger":
          return await this.executeTriggerNode(config, context);

        case "ai":
          return await this.executeAINodeType(config, context);

        case "action":
          return await this.executeActionNode(config, context);

        case "logic":
          return await this.executeLogicNode(config, context);

        default:
          return {
            success: false,
            error: `Unsupported node category: ${definition.category}`,
          };
      }
    } catch (error: unknown) {
      return {
        success: false,
        error: getErrorMessage(error, "Execution failed"),
      };
    }
  }

  private async executeTriggerNode(
    config: Record<string, unknown>,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    return {
      success: true,
      output:
        context.input || {
          triggeredAt: new Date().toISOString(),
          config,
        },
    };
  }

  private async executeAINodeType(
    config: Record<string, unknown>,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const result = await this.executeAINode(config.type as string, config, context);
    return {
      success: true,
      output: result,
    };
  }

  private async executeActionNode(
    config: Record<string, unknown>,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    switch (config.type) {
      case "httpRequest":
        return await this.executeHttpRequest(config, context);

      case "dataTransform":
        return this.executeDataTransform(config, context);

      case "sendEmail":
        return this.executeSendEmail(config, context);

      default:
        return {
          success: false,
          error: `Unknown action node type: ${config.type}`,
        };
    }
  }

  private async executeHttpRequest(
    config: Record<string, unknown>,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    try {
      const {
        method = "GET",
        url,
        headers = "{}",
        body = "{}",
      } = config as {
        method?: string;
        url?: unknown;
        headers?: unknown;
        body?: unknown;
      };

      const templateContext: TemplateContext = {
        input: context.input,
        previousNodes: context.previousNodes,
      };

      const processedUrl = replaceTemplateVariables(url, templateContext);
      const processedHeaders = replaceTemplateVariables(headers, templateContext);
      const processedBody = replaceTemplateVariables(body, templateContext);

      if (!processedUrl) {
        return {
          success: false,
          error: "URL is required",
        };
      }

      const response = await fetch("/api/http-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: processedUrl,
          method,
          headers: processedHeaders,
          body: method !== "GET" ? processedBody : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || "HTTP request failed",
        };
      }

      return {
        success: true,
        output: result,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: getErrorMessage(error, "HTTP request failed"),
      };
    }
  }

  private executeDataTransform(
    config: Record<string, unknown>,
    context: NodeExecutionContext
  ): NodeExecutionResult {
    try {
      const { code } = config as { code: string };
      const transformFunction = new Function("input", "previousNodes", code);
      const output = transformFunction(context.input, context.previousNodes);

      return {
        success: true,
        output,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: getErrorMessage(error, "Data transformation failed"),
      };
    }
  }

  private executeSendEmail(
    config: Record<string, unknown>,
    context: NodeExecutionContext
  ): NodeExecutionResult {
    const templateContext: TemplateContext = {
      input: context.input,
      previousNodes: context.previousNodes,
    };

    const { to = "", subject = "", body = "" } = config as {
      to?: unknown;
      subject?: unknown;
      body?: unknown;
    };

    const processedTo = replaceTemplateVariables(to, templateContext);
    const processedSubject = replaceTemplateVariables(subject, templateContext);
    const processedBody = replaceTemplateVariables(body, templateContext);

    return {
      success: true,
      output: {
        sent: true,
        to: processedTo,
        subject: processedSubject,
        body: processedBody,
        sentAt: new Date().toISOString(),
        message: "✉️ Email sent successfully (simulated)",
      },
    };
  }

  private async executeLogicNode(
    config: Record<string, unknown>,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    switch (config.type) {
      case "ifElse":
        return this.executeIfElse(config, context);

      case "switch":
        return this.executeSwitch(config, context);

      case "delay":
        return await this.executeDelay(config, context);

      default:
        return {
          success: false,
          error: `Unknown logic node type: ${config.type}`,
        };
    }
  }

  private executeIfElse(
    config: Record<string, unknown>,
    context: NodeExecutionContext
  ): NodeExecutionResult {
    try {
      const { condition, operator } = config as { condition: string; operator: string };

      let result = false;

      if (operator === "javascript") {
        const evaluateFunction = new Function("input", "previousNodes", `return ${condition}`);
        result = Boolean(evaluateFunction(context.input, context.previousNodes));
      }

      return {
        success: true,
        output: {
          condition: result,
          branch: result ? "true" : "false",
          input: context.input,
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: getErrorMessage(error, "Condition evaluation failed"),
      };
    }
  }

  private executeSwitch(
    config: Record<string, unknown>,
    context: NodeExecutionContext
  ): NodeExecutionResult {
    const propertyPath =
      typeof config.property === "string" && config.property.trim().length > 0
        ? config.property.trim()
        : "input";

    const cases = parseSwitchCases(config as Record<string, unknown>);

    try {
      const propertyValue = (() => {
        if (!propertyPath || propertyPath === "input") {
          return context.input;
        }

        if (propertyPath.startsWith("input.")) {
          return resolvePath(context.input, propertyPath.slice(6));
        }

        const [nodeId, ...rest] = propertyPath.split(".");
        if (nodeId && context.previousNodes[nodeId] !== undefined) {
          const base = context.previousNodes[nodeId];
          if (rest.length === 0) {
            return base;
          }
          return resolvePath(base, rest.join("."));
        }

        return resolvePath(context.input, propertyPath);
      })();

      const stringValue =
        propertyValue !== undefined && propertyValue !== null
          ? String(propertyValue)
          : null;

      let matchedIndex = -1;

      if (stringValue !== null) {
        matchedIndex = cases.findIndex((caseValue) => caseValue === stringValue);
      }

      const branch = matchedIndex >= 0 ? `case_${matchedIndex}` : "default";

      return {
        success: true,
        output: {
          branch,
          matchedCase: matchedIndex >= 0 ? cases[matchedIndex] : null,
          value: propertyValue,
          cases,
          input: context.input,
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: getErrorMessage(error, "Switch evaluation failed"),
      };
    }
  }

  private async executeDelay(
    config: Record<string, unknown>,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const { duration, unit } = config as { duration: string; unit: string };
    const ms = unit === "seconds" ? parseInt(duration, 10) * 1000 : parseInt(duration, 10);

    await new Promise((resolve) => setTimeout(resolve, ms));

    return {
      success: true,
      output: {
        delayed: ms,
        input: context.input,
      },
    };
  }
}
