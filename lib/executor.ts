import { NodeExecutionContext, NodeExecutionResult } from "./types";
import { nodeDefinitions } from "./node-definitions";

// Helper function to replace template variables like {{input}} or {{input.fieldName}}
function replaceTemplateVariables(text: string, input: any): string {
  if (typeof text !== "string") return text;

  return text.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const trimmedPath = path.trim();

    // Handle {{input}} - return entire input
    if (trimmedPath === "input") {
      return typeof input === "object" ? JSON.stringify(input) : String(input);
    }

    // Handle {{input.fieldName}} - access nested properties
    if (trimmedPath.startsWith("input.")) {
      const fields = trimmedPath.substring(6).split(".");
      let result = input;

      for (const field of fields) {
        if (result && typeof result === "object") {
          result = result[field];
        } else {
          return match; // Return original if path is invalid
        }
      }

      return result !== undefined && result !== null ? String(result) : match;
    }

    return match; // Return original if pattern doesn't match
  });
}

export class WorkflowExecutor {
  private async executeAINode(
    type: string,
    config: Record<string, any>,
    input: any
  ): Promise<any> {
    try {
      const response = await fetch("/api/ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, config, input }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "AI execution failed");
      }

      return await response.json();
    } catch (error: any) {
      throw new Error(error.message || "Failed to execute AI node");
    }
  }

  async executeNode(
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const { nodeId, input, config } = context;
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
          return await this.executeTriggerNode(config, input);

        case "ai":
          return await this.executeAINodeType(config, input);

        case "action":
          return await this.executeActionNode(config, input);

        case "logic":
          return await this.executeLogicNode(config, input);

        default:
          return {
            success: false,
            error: `Unsupported node category: ${definition.category}`,
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Execution failed",
      };
    }
  }

  private async executeTriggerNode(
    config: Record<string, any>,
    input: any
  ): Promise<NodeExecutionResult> {
    // Trigger nodes pass through their input or generate initial data
    return {
      success: true,
      output: input || {
        triggeredAt: new Date().toISOString(),
        config: config,
      },
    };
  }

  private async executeAINodeType(
    config: Record<string, any>,
    input: any
  ): Promise<NodeExecutionResult> {
    const result = await this.executeAINode(config.type, config, input);
    return {
      success: true,
      output: result,
    };
  }

  private async executeActionNode(
    config: Record<string, any>,
    input: any
  ): Promise<NodeExecutionResult> {
    switch (config.type) {
      case "httpRequest":
        return await this.executeHttpRequest(config, input);

      case "dataTransform":
        return this.executeDataTransform(config, input);

      case "sendEmail":
        return this.executeSendEmail(config, input);

      default:
        return {
          success: false,
          error: `Unknown action node type: ${config.type}`,
        };
    }
  }

  private async executeHttpRequest(
    config: Record<string, any>,
    input: any
  ): Promise<NodeExecutionResult> {
    try {
      let { method = "GET", url, headers = "{}", body = "{}" } = config;

      // Process template variables
      url = replaceTemplateVariables(url, input);
      headers = replaceTemplateVariables(headers, input);
      body = replaceTemplateVariables(body, input);

      // Validate URL
      if (!url || typeof url !== "string") {
        return {
          success: false,
          error: "URL is required",
        };
      }

      // Make request through our API to avoid CORS issues
      const response = await fetch("/api/http-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          method,
          headers,
          body: method !== "GET" ? body : undefined,
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
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "HTTP request failed",
      };
    }
  }

  private executeDataTransform(
    config: Record<string, any>,
    input: any
  ): NodeExecutionResult {
    try {
      const { code } = config;

      // Create a safe function from the code
      const transformFunction = new Function("input", code);
      const output = transformFunction(input);

      return {
        success: true,
        output,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Data transformation failed",
      };
    }
  }

  private executeSendEmail(
    config: Record<string, any>,
    input: any
  ): NodeExecutionResult {
    // Simulated email sending
    let { to, subject, body } = config;

    // Process template variables
    to = replaceTemplateVariables(to, input);
    subject = replaceTemplateVariables(subject, input);
    body = replaceTemplateVariables(body, input);

    return {
      success: true,
      output: {
        sent: true,
        to,
        subject,
        body,
        sentAt: new Date().toISOString(),
        message: "✉️ Email sent successfully (simulated)",
      },
    };
  }

  private async executeLogicNode(
    config: Record<string, any>,
    input: any
  ): Promise<NodeExecutionResult> {
    switch (config.type) {
      case "ifElse":
        return this.executeIfElse(config, input);

      case "delay":
        return await this.executeDelay(config, input);

      default:
        return {
          success: false,
          error: `Unknown logic node type: ${config.type}`,
        };
    }
  }

  private executeIfElse(
    config: Record<string, any>,
    input: any
  ): NodeExecutionResult {
    try {
      const { condition, operator } = config;

      let result = false;

      if (operator === "javascript") {
        const evaluateFunction = new Function("input", `return ${condition}`);
        result = evaluateFunction(input);
      }

      return {
        success: true,
        output: {
          condition: result,
          branch: result ? "true" : "false",
          input,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Condition evaluation failed",
      };
    }
  }

  private async executeDelay(
    config: Record<string, any>,
    input: any
  ): Promise<NodeExecutionResult> {
    const { duration, unit } = config;
    const ms =
      unit === "seconds" ? parseInt(duration) * 1000 : parseInt(duration);

    await new Promise((resolve) => setTimeout(resolve, ms));

    return {
      success: true,
      output: {
        delayed: ms,
        input,
      },
    };
  }
}