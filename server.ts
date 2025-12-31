/// <reference types="node" />

import { GoogleGenAI } from "@google/genai";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ReadResourceRequest,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";

// ESM dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const IMAGES_DIR = path.join(__dirname, "images");
const PORT = parseInt(process.env.PORT || "3001", 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Initialize Gemini client
if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY environment variable is required");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Initialize Express server for static file serving
const app = express();
app.use("/images", express.static(IMAGES_DIR));

// Start Express server
const expressServer = app.listen(PORT, () => {
  console.error(`Express server running on http://localhost:${PORT}`);
});

// Initialize MCP Server
const server = new Server(
  {
    name: "gemini-image-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_image",
        description:
          "Generate an image using Google Gemini AI based on a text prompt",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The text prompt describing the image to generate",
            },
            filename: {
              type: "string",
              description:
                "Optional custom filename (without extension) for the generated image",
            },
          },
          required: ["prompt"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(
  CallToolRequestSchema,
  async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    if (name !== "generate_image") {
      throw new Error(`Unknown tool: ${name}`);
    }

    const { prompt, filename } = args as { prompt: string; filename?: string };

    if (!prompt || typeof prompt !== "string") {
      throw new Error("prompt is required and must be a string");
    }

    try {
      // Create chat with Gemini for image generation
      const chat = ai.chats.create({
        model: "gemini-3-pro-image-preview",
        config: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      });

      // Send the prompt and get response
      const response = await chat.sendMessage({ message: prompt });

      // Extract image from response
      let imageData: string | null = null;
      let mimeType: string = "image/png";

      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              imageData = part.inlineData.data;
              mimeType = part.inlineData.mimeType || "image/png";
              break;
            }
          }
        }
      }

      if (!imageData) {
        throw new Error("No image was generated in the response");
      }

      // Generate ID and filename
      const id = filename || uuidv4();
      const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
      const imagePath = path.join(IMAGES_DIR, `${safeId}.png`);
      const url = `/images/${safeId}.png`;

      // Decode base64 and save to file
      const buffer = Buffer.from(imageData, "base64");
      fs.writeFileSync(imagePath, buffer);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ id: safeId, url }, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      throw new Error(`Failed to generate image: ${errorMessage}`);
    }
  }
);

// List available resources (generated images)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const files: string[] = fs.readdirSync(IMAGES_DIR);
  const pngFiles = files.filter((file: string) => file.endsWith(".png"));

  return {
    resources: pngFiles.map((file: string) => ({
      uri: `images/${file}`,
      name: file,
      mimeType: "image/png",
      description: `Generated image: ${file}`,
    })),
  };
});

// Read resource content
server.setRequestHandler(
  ReadResourceRequestSchema,
  async (request: ReadResourceRequest) => {
    const { uri } = request.params;

    // Extract filename from URI (format: images/{filename}.png)
    const match = uri.match(/^images\/(.+\.png)$/);
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`);
    }

    const filename = match[1];
    const filePath = path.join(IMAGES_DIR, filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Resource not found: ${uri}`);
    }

    // Read file and encode as base64
    const buffer = fs.readFileSync(filePath);
    const base64Data = buffer.toString("base64");

    return {
      contents: [
        {
          uri,
          mimeType: "image/png",
          blob: base64Data,
        },
      ],
    };
  }
);

// Start MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gemini Image MCP server running on stdio");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.error("Shutting down...");
  expressServer.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("Shutting down...");
  expressServer.close();
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
