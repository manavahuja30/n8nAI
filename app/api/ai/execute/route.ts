import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

// Helper functions to resolve template variables
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringifyValue = (value: unknown): string =>
  isObject(value) ? JSON.stringify(value) : String(value);

const resolvePath = (source: unknown, path: string): unknown => {
  if (!path) return source;

  const sanitized = path
    .replace(/\[(\w+)\]/g, ".$1")
    .replace(/^\./, "");

  const segments = sanitized.split(".").filter(Boolean);

  return segments.reduce<unknown>((acc, key) => {
    if (acc === undefined || acc === null) {
      return undefined;
    }

    if (Array.isArray(acc)) {
      const index = Number(key);
      return Number.isInteger(index) ? acc[index] : undefined;
    }

    if (isObject(acc)) {
      return acc[key];
    }

    return undefined;
  }, source);
};

function replaceTemplateVariables(
  text: unknown,
  input: unknown,
  previousNodes: Record<string, unknown> = {}
): string {
  if (typeof text !== "string") {
    return String(text ?? "");
  }

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

export async function POST(request: NextRequest) {
  try {
    const { type, config, input, previousNodes = {} } = await request.json();

    // Get API key from environment
    const geminiOpenAIKey = process.env.GEMINI_OPENAI_API_KEY;
    const googleGenAIKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;

    // Check if using OpenAI-compatible endpoint (GEMINI_OPENAI_API_KEY)
    const useOpenAICompatible = !!geminiOpenAIKey;
    const apiKey = geminiOpenAIKey || googleGenAIKey;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Gemini API key not configured. Add GEMINI_OPENAI_API_KEY or GOOGLE_GENAI_API_KEY to .env file",
        },
        { status: 500 }
      );
    }

    // Default model name - use a stable model
    const modelName = config.model || (useOpenAICompatible ? "gemini-2.0-flash-exp" : "gemini-1.5-flash");

    // Initialize client based on API key type
    let genAI: GoogleGenAI;
    let openaiClient: OpenAI | null = null;

    if (useOpenAICompatible) {
      // Use OpenAI-compatible endpoint for Gemini
      openaiClient = new OpenAI({
        apiKey: geminiOpenAIKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });
      // Still create GoogleGenAI for compatibility
      genAI = new GoogleGenAI({ apiKey: geminiOpenAIKey });
    } else {
      // Use standard Google GenAI SDK
      genAI = new GoogleGenAI({ apiKey });
    }

    let result;

    switch (type) {
      case "aiTextGenerator":
        result = await executeTextGenerator(
          config,
          input,
          previousNodes,
          genAI,
          openaiClient,
          modelName,
          useOpenAICompatible
        );
        break;

      case "aiAnalyzer":
        result = await executeAnalyzer(
          config,
          input,
          previousNodes,
          genAI,
          openaiClient,
          modelName,
          useOpenAICompatible
        );
        break;

      case "aiChatbot":
        result = await executeChatbot(
          config,
          input,
          previousNodes,
          genAI,
          openaiClient,
          modelName,
          useOpenAICompatible
        );
        break;

      case "aiDataExtractor":
        result = await executeDataExtractor(
          config,
          input,
          previousNodes,
          genAI,
          openaiClient,
          modelName,
          useOpenAICompatible
        );
        break;

      default:
        return NextResponse.json(
          { error: `Unknown AI node type: ${type}` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("AI execution error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      status: error.status,
      response: error.response,
      code: error.code,
      cause: error.cause,
    });

    // Extract more detailed error information
    const errorMessage = error.message || String(error);
    const errorCode = error.code || error.status;

    // Handle specific Gemini API errors
    if (errorMessage?.includes("API key") || errorMessage?.includes("authentication") || errorCode === 401) {
      return NextResponse.json(
        { error: "Invalid or missing Gemini API key. Please check your GEMINI_OPENAI_API_KEY in .env file" },
        { status: 401 }
      );
    }

    if (errorMessage?.includes("quota") || errorMessage?.includes("rate limit") || errorCode === 429) {
      return NextResponse.json(
        { 
          error: "API quota exceeded or rate limit reached",
          details: "Please check your Gemini API quota or try again later"
        },
        { status: 429 }
      );
    }

    // Check for model not found errors
    if (errorMessage?.includes("model") || errorMessage?.includes("not found")) {
      return NextResponse.json(
        { 
          error: "Model not found or unavailable",
          details: "The model may not be available. Try using 'gemini-1.5-flash' or 'gemini-1.5-pro'"
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: errorMessage || "AI execution failed",
        details: errorCode ? `Error code: ${errorCode}` : undefined,
        fullError: process.env.NODE_ENV === "development" ? error.toString() : undefined,
      },
      { status: 500 }
    );
  }
}

async function executeTextGenerator(
  config: any,
  input: any,
  previousNodes: Record<string, any>,
  genAI: GoogleGenAI,
  openaiClient: OpenAI | null,
  modelName: string,
  useOpenAICompatible: boolean
) {
  let { prompt, temperature, maxTokens } = config;

  // Replace template variables in prompt
  prompt = replaceTemplateVariables(prompt, input, previousNodes);

  // If input is provided and prompt doesn't include it, append it
  if (input && !prompt.includes("{{input}}")) {
    const inputText = typeof input === "string" 
      ? input 
      : JSON.stringify(input, null, 2);
    prompt = prompt ? `${prompt}\n\nInput:\n${inputText}` : inputText;
  }

  console.log("Executing text generator with:", {
    model: modelName,
    useOpenAICompatible,
    prompt: prompt?.substring(0, 50),
  });

  let generatedText = "";
  let usage: any = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  try {
    if (useOpenAICompatible && openaiClient) {
      // Use OpenAI-compatible API
      const completion = await openaiClient.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: temperature ? parseFloat(temperature) : 0.7,
        max_tokens: maxTokens ? parseInt(maxTokens) : 500,
      });

      generatedText = completion.choices[0]?.message?.content || "";
      usage = completion.usage || usage;
    } else {
      // Use standard Google GenAI SDK
      const requestParams: any = {
        model: modelName,
        contents: prompt,
      };

      // Add config only if we have parameters
      const configParams: any = {};
      if (temperature) {
        configParams.temperature = parseFloat(temperature);
      }
      if (maxTokens) {
        configParams.maxOutputTokens = parseInt(maxTokens);
      }

      if (Object.keys(configParams).length > 0) {
        requestParams.config = configParams;
      }

      const response = await genAI.models.generateContent(requestParams);
      generatedText = response.text || "";
    }
  } catch (error: any) {
    console.error("Text generation error:", error);
    throw error;
  }

  console.log("Text generator completed:", { model: modelName });

  return {
    generatedText,
    model: modelName,
    usage,
  };
}

// Helper function to call Gemini API with either client
async function callGeminiAPI(
  prompt: string,
  genAI: GoogleGenAI,
  openaiClient: OpenAI | null,
  modelName: string,
  useOpenAICompatible: boolean,
  temperature: number = 0.7,
  maxTokens?: number
): Promise<{ text: string; usage: any }> {
  if (useOpenAICompatible && openaiClient) {
    const completion = await openaiClient.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
    });
    return {
      text: completion.choices[0]?.message?.content || "",
      usage: completion.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  } else {
    const requestParams: any = {
      model: modelName,
      contents: prompt,
    };
    const configParams: any = { temperature };
    if (maxTokens) configParams.maxOutputTokens = maxTokens;
    if (Object.keys(configParams).length > 0) {
      requestParams.config = configParams;
    }
    const response = await genAI.models.generateContent(requestParams);
    return {
      text: response.text || "",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}

async function executeAnalyzer(
  config: any,
  input: any,
  previousNodes: Record<string, any>,
  genAI: GoogleGenAI,
  openaiClient: OpenAI | null,
  modelName: string,
  useOpenAICompatible: boolean
) {
  let { text, analysisType } = config;

  // Process template variables in text
  text = replaceTemplateVariables(text, input, previousNodes);

  // If input is provided and text doesn't include it, use input
  if (input && !text) {
    text = typeof input === "string" 
      ? input 
      : JSON.stringify(input, null, 2);
  }

  let systemPrompt = "";

  switch (analysisType) {
    case "sentiment":
      systemPrompt =
        "Analyze the sentiment of the following text. Respond with: Positive, Negative, or Neutral, followed by a confidence score (0-1) and brief explanation.";
      break;

    case "keywords":
      systemPrompt =
        "Extract the most important keywords and phrases from the following text. Return them as a JSON array.";
      break;

    case "summary":
      systemPrompt =
        "Provide a concise summary of the following text in 2-3 sentences.";
      break;

    default:
      systemPrompt = "Analyze the following data and provide insights.";
  }

  const fullPrompt = systemPrompt 
    ? `${systemPrompt}\n\nText to analyze:\n${text}`
    : text;

  const { text: result, usage } = await callGeminiAPI(
    fullPrompt,
    genAI,
    openaiClient,
    modelName,
    useOpenAICompatible,
    0.3
  );

  return {
    analysisType,
    result,
    usage,
  };
}

async function executeChatbot(
  config: any,
  input: any,
  previousNodes: Record<string, any>,
  genAI: GoogleGenAI,
  openaiClient: OpenAI | null,
  modelName: string,
  useOpenAICompatible: boolean
) {
  let { systemPrompt, userMessage, personality } = config;

  // Process template variables
  systemPrompt = replaceTemplateVariables(systemPrompt, input, previousNodes);
  userMessage = replaceTemplateVariables(userMessage, input, previousNodes);

  // If input is provided and userMessage doesn't include it, use input
  if (input && !userMessage) {
    userMessage = typeof input === "string" 
      ? input 
      : JSON.stringify(input, null, 2);
  }

  const personalityPrompts = {
    professional: "Respond in a professional and formal manner.",
    friendly: "Respond in a warm, friendly, and conversational manner.",
    concise: "Respond with brief, to-the-point answers.",
  };

  const fullSystemPrompt = systemPrompt || "You are a helpful assistant.";
  const personalityPrompt = personalityPrompts[personality as keyof typeof personalityPrompts] || "";

  const fullPrompt = personalityPrompt
    ? `${fullSystemPrompt}\n\n${personalityPrompt}\n\nUser message: ${userMessage}`
    : `${fullSystemPrompt}\n\nUser message: ${userMessage}`;

  const { text: responseText, usage } = await callGeminiAPI(
    fullPrompt,
    genAI,
    openaiClient,
    modelName,
    useOpenAICompatible,
    0.7
  );

  return {
    response: responseText,
    personality,
    usage,
  };
}

async function executeDataExtractor(
  config: any,
  input: any,
  previousNodes: Record<string, any>,
  genAI: GoogleGenAI,
  openaiClient: OpenAI | null,
  modelName: string,
  useOpenAICompatible: boolean
) {
  let { text, schema } = config;

  // Process template variables
  text = replaceTemplateVariables(text, input, previousNodes);
  schema = replaceTemplateVariables(schema, input, previousNodes);

  // If input is provided and text doesn't include it, use input
  if (input && !text) {
    text = typeof input === "string" 
      ? input 
      : JSON.stringify(input, null, 2);
  }

  const systemPrompt = schema
    ? `Extract information from the text according to this schema: ${schema}. Return ONLY a valid JSON object matching the schema, with no additional text or explanation.`
    : "Extract structured information from the following text. Return ONLY a valid JSON object, with no additional text or explanation.";

  const fullPrompt = `${systemPrompt}\n\nText to extract from:\n${text}`;

  const { text: extractedData, usage } = await callGeminiAPI(
    fullPrompt,
    genAI,
    openaiClient,
    modelName,
    useOpenAICompatible,
    0.1
  );

  try {
    // Try to find JSON in the response
    const jsonMatch = extractedData.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        extractedData: parsed,
        schema,
        usage,
      };
    } else {
      throw new Error("No JSON found in response");
    }
  } catch (e) {
    return {
      extractedData: extractedData,
      schema,
      usage,
      note: "Could not parse as JSON, returning raw text",
    };
  }
}
