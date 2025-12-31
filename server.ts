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

// ESM dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
// Use project root's images directory (go up from dist/ if running compiled)
const PROJECT_ROOT = __dirname.endsWith("dist")
  ? path.dirname(__dirname)
  : __dirname;
const IMAGES_DIR = path.join(PROJECT_ROOT, "images");
const PORT = parseInt(process.env.PORT || "3001", 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Aspect ratio presets for web development
const ASPECT_PRESETS: Record<string, string> = {
  hero: "16:9",
  square: "1:1",
  portrait: "3:4",
  landscape: "4:3",
  banner: "21:9",
  mobile: "9:16",
};

// Valid aspect ratios supported by Gemini
const VALID_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
];

// Valid resolutions for Gemini 3 Pro
const VALID_RESOLUTIONS = ["1K", "2K", "4K"];

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

// Start Express server with error handling
let expressServer: ReturnType<typeof app.listen> | null = null;

function startExpressServer(port: number): void {
  expressServer = app.listen(port, () => {
    console.error(`Express server running on http://localhost:${port}`);
  });

  expressServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${port} is in use, trying ${port + 1}...`);
      startExpressServer(port + 1);
    } else {
      console.error(`Express server error: ${err.message}`);
    }
  });
}

startExpressServer(PORT);

// Initialize MCP Server
const server = new Server(
  {
    name: "gemini-image-mcp",
    version: "3.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Helper: Resolve aspect ratio from preset or direct value
function resolveAspectRatio(input?: string): string {
  if (!input) return "1:1";
  const preset = ASPECT_PRESETS[input.toLowerCase()];
  if (preset) return preset;
  if (VALID_ASPECT_RATIOS.includes(input)) return input;
  console.error(`Invalid aspect ratio "${input}", defaulting to 1:1`);
  return "1:1";
}

// Helper: Validate resolution
function resolveResolution(input?: string): string {
  if (!input) return "1K";
  const upper = input.toUpperCase();
  if (VALID_RESOLUTIONS.includes(upper)) return upper;
  console.error(`Invalid resolution "${input}", defaulting to 1K`);
  return "1K";
}

// Helper: Extract image from Gemini response
// Helper: Read and encode image file to base64
function readImageAsBase64(imagePath: string): {
  data: string;
  mimeType: string;
} {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");

  const ext = path.extname(imagePath).toLowerCase();
  const mimeType =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".png"
      ? "image/png"
      : ext === ".gif"
      ? "image/gif"
      : ext === ".webp"
      ? "image/webp"
      : "image/png";

  return { data: base64Image, mimeType };
}

function extractImageFromResponse(response: unknown): {
  data: string;
  mimeType: string;
} | null {
  const resp = response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
        }>;
      };
    }>;
  };

  if (resp.candidates && resp.candidates.length > 0) {
    const candidate = resp.candidates[0];
    if (candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return {
            data: part.inlineData.data,
            mimeType: part.inlineData.mimeType || "image/png",
          };
        }
      }
    }
  }
  return null;
}

// Helper: Save image to specified path AND to the MCP server's images directory
function saveImage(
  imageData: string,
  outputPath: string
): { id: string; path: string; url: string } {
  // Generate ID from filename
  const filename = path.basename(outputPath, path.extname(outputPath));
  const safeId = filename.replace(/[^a-zA-Z0-9_-]/g, "_");

  const buffer = Buffer.from(imageData, "base64");

  // Save to user's specified output path
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, buffer);

  // Also save to MCP server's images directory for Express serving
  const localPath = path.join(IMAGES_DIR, `${safeId}.png`);
  fs.writeFileSync(localPath, buffer);

  return {
    id: safeId,
    path: outputPath,
    url: `http://localhost:${PORT}/images/${safeId}.png`,
  };
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_image",
        description:
          "Generate an image using Google Gemini. IMPORTANT: Before calling this tool, determine the correct output path in the user's project (e.g., public/images/, src/assets/, etc.). Supports aspect ratio presets (hero, square, portrait, landscape, banner, mobile) or explicit ratios (16:9, 1:1, etc.), and resolutions (1K, 2K, 4K).",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Text description of the image to generate",
            },
            outputPath: {
              type: "string",
              description:
                "REQUIRED: Absolute path where the image should be saved (e.g., /Users/name/project/public/images/hero.png). Determine this path BEFORE calling the tool by checking the project's image directory structure.",
            },
            referenceImages: {
              type: "array",
              items: { type: "string" },
              description:
                "Optional array of absolute paths to reference images. Use these to guide style, composition, or content of the generated image.",
            },
            aspectRatio: {
              type: "string",
              description:
                "Aspect ratio preset (hero, square, portrait, landscape, banner, mobile) or explicit ratio (16:9, 1:1, 3:4, 4:3, 21:9, 9:16). Defaults to square (1:1).",
            },
            resolution: {
              type: "string",
              description:
                "Output resolution: 1K (default), 2K, or 4K. Higher resolutions take longer.",
            },
          },
          required: ["prompt", "outputPath"],
        },
      },
      {
        name: "edit_image",
        description:
          "Edit an existing image using Google Gemini. IMPORTANT: Before calling this tool, determine the correct output path in the user's project. Provide the source image path and describe what changes to make.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description:
                "Description of what to change in the image (e.g., 'change the background to blue', 'add a logo in the corner')",
            },
            sourceImage: {
              type: "string",
              description: "Absolute path to the source image file to edit",
            },
            outputPath: {
              type: "string",
              description:
                "REQUIRED: Absolute path where the edited image should be saved. Determine this path BEFORE calling the tool.",
            },
            aspectRatio: {
              type: "string",
              description:
                "Optional: change aspect ratio during edit. Preset or explicit ratio.",
            },
            resolution: {
              type: "string",
              description: "Output resolution: 1K (default), 2K, or 4K.",
            },
          },
          required: ["prompt", "sourceImage", "outputPath"],
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

    if (name === "generate_image") {
      const { prompt, outputPath, referenceImages, aspectRatio, resolution } =
        args as {
          prompt: string;
          outputPath: string;
          referenceImages?: string[];
          aspectRatio?: string;
          resolution?: string;
        };

      if (!prompt || typeof prompt !== "string") {
        throw new Error("prompt is required and must be a string");
      }

      if (!outputPath || typeof outputPath !== "string") {
        throw new Error(
          "outputPath is required - specify the absolute path where the image should be saved in the project"
        );
      }

      const resolvedAspectRatio = resolveAspectRatio(aspectRatio);
      const resolvedResolution = resolveResolution(resolution);

      try {
        // Build contents: reference images first, then prompt
        const contents: Array<
          { inlineData: { mimeType: string; data: string } } | { text: string }
        > = [];

        if (referenceImages && referenceImages.length > 0) {
          for (const imagePath of referenceImages) {
            const imageData = readImageAsBase64(imagePath);
            contents.push({
              inlineData: {
                mimeType: imageData.mimeType,
                data: imageData.data,
              },
            });
          }
        }

        contents.push({ text: prompt });

        const response = await ai.models.generateContent({
          model: "gemini-3-pro-image-preview",
          contents,
          config: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              aspectRatio: resolvedAspectRatio,
              imageSize: resolvedResolution,
            },
          } as Record<string, unknown>,
        });

        const imageResult = extractImageFromResponse(response);
        if (!imageResult) {
          throw new Error("No image was generated in the response");
        }

        const saved = saveImage(imageResult.data, outputPath);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  path: saved.path,
                  url: saved.url,
                  aspectRatio: resolvedAspectRatio,
                  resolution: resolvedResolution,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        throw new Error(`Failed to generate image: ${errorMessage}`);
      }
    }

    if (name === "edit_image") {
      const { prompt, sourceImage, outputPath, aspectRatio, resolution } =
        args as {
          prompt: string;
          sourceImage: string;
          outputPath: string;
          aspectRatio?: string;
          resolution?: string;
        };

      if (!prompt || typeof prompt !== "string") {
        throw new Error("prompt is required and must be a string");
      }

      if (!sourceImage || typeof sourceImage !== "string") {
        throw new Error("sourceImage path is required");
      }

      if (!outputPath || typeof outputPath !== "string") {
        throw new Error(
          "outputPath is required - specify the absolute path where the edited image should be saved"
        );
      }

      const resolvedAspectRatio = aspectRatio
        ? resolveAspectRatio(aspectRatio)
        : undefined;
      const resolvedResolution = resolveResolution(resolution);

      try {
        const imageData = readImageAsBase64(sourceImage);
        const contents = [
          {
            inlineData: {
              mimeType: imageData.mimeType,
              data: imageData.data,
            },
          },
          { text: prompt },
        ];

        const config: Record<string, unknown> = {
          responseModalities: ["TEXT", "IMAGE"],
        };

        if (resolvedAspectRatio || resolvedResolution) {
          config.imageConfig = {
            ...(resolvedAspectRatio && { aspectRatio: resolvedAspectRatio }),
            ...(resolvedResolution && { imageSize: resolvedResolution }),
          };
        }

        const response = await ai.models.generateContent({
          model: "gemini-3-pro-image-preview",
          contents,
          config: config as Record<string, unknown>,
        });

        const imageResult = extractImageFromResponse(response);
        if (!imageResult) {
          throw new Error("No image was generated in the response");
        }

        const saved = saveImage(imageResult.data, outputPath);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  path: saved.path,
                  url: saved.url,
                  sourceImage,
                  aspectRatio: resolvedAspectRatio || "preserved",
                  resolution: resolvedResolution,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        throw new Error(`Failed to edit image: ${errorMessage}`);
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  }
);

// List available resources (generated images)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const files: string[] = fs.readdirSync(IMAGES_DIR);
  const imageFiles = files.filter((file: string) =>
    /\.(png|jpg|jpeg|gif|webp)$/i.test(file)
  );

  return {
    resources: imageFiles.map((file: string) => ({
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

    const match = uri.match(/^images\/(.+\.(png|jpg|jpeg|gif|webp))$/i);
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`);
    }

    const filename = match[1];
    const filePath = path.join(IMAGES_DIR, filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Resource not found: ${uri}`);
    }

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
  console.error("Gemini Image MCP server v2.0 running on stdio");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.error("Shutting down...");
  expressServer?.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("Shutting down...");
  expressServer?.close();
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
