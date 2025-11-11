
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { url, method = "GET", headers = "{}", body } = await request.json();

    // Validate URL
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Ensure URL has a protocol
    let validUrl = url.trim();
    if (!validUrl.startsWith("http://") && !validUrl.startsWith("https://")) {
      validUrl = "https://" + validUrl;
    }

    // Parse headers
    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = JSON.parse(headers);
    } catch (e) {
      // Ignore invalid JSON headers
    }

    // Parse body for non-GET requests
    let parsedBody;
    if (method !== "GET" && body) {
      try {
        parsedBody = JSON.parse(body);
      } catch (e) {
        parsedBody = body; // Use as-is if not valid JSON
      }
    }

    // Make the actual HTTP request
    const response = await fetch(validUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Minimal-n8n/1.0",
        ...parsedHeaders,
      },
      body: parsedBody ? JSON.stringify(parsedBody) : undefined,
    });

    // Get response content type
    const contentType = response.headers.get("content-type");
    let data;

    // Handle different content types
    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else if (contentType?.includes("text/")) {
      data = await response.text();
    } else {
      // For binary or unknown content, convert to text
      data = await response.text();
    }

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data,
    });
  } catch (error: any) {
    console.error("HTTP proxy error:", error);
    return NextResponse.json(
      {
        error: error.message || "HTTP request failed",
        details: error.cause?.message,
      },
      { status: 500 }
    );
  }
}
