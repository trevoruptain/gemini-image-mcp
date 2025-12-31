# Gemini Image MCP

An MCP (Model Context Protocol) server that enables AI assistants to generate images using Google's Gemini API.

## Features

- **Image Generation Tool** - Generate images from text prompts via Gemini's `gemini-3-pro-image-preview` model
- **MCP Resources** - Access generated images as MCP resources
- **Static File Server** - Express server for direct HTTP access to images

## Prerequisites

- Node.js 18+
- A [Google Gemini API key](https://ai.google.dev/gemini-api/docs/api-key) with access to image generation

## Installation

```bash
git clone https://github.com/trevoruptain/gemini-image-mcp.git
cd gemini-image-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable         | Required | Default | Description                             |
| ---------------- | -------- | ------- | --------------------------------------- |
| `GEMINI_API_KEY` | Yes      | -       | Your Google Gemini API key              |
| `PORT`           | No       | `3001`  | Port for the Express static file server |

### Cursor

Add to your `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gemini-image": {
      "command": "node",
      "args": ["/path/to/gemini-image-mcp/dist/server.js"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Antigravity

Add to your MCP server configuration:

```json
{
  "gemini-image": {
    "command": "node",
    "args": ["/path/to/gemini-image-mcp/dist/server.js"],
    "env": {
      "GEMINI_API_KEY": "your-api-key-here"
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gemini-image": {
      "command": "node",
      "args": ["/path/to/gemini-image-mcp/dist/server.js"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Usage

Once configured, the AI assistant can use the `generate_image` tool:

### Tool: `generate_image`

Generates an image from a text prompt.

**Input:**

```json
{
  "prompt": "A serene mountain landscape at sunset",
  "filename": "mountain-sunset"
}
```

| Parameter  | Type   | Required | Description                                              |
| ---------- | ------ | -------- | -------------------------------------------------------- |
| `prompt`   | string | Yes      | Text description of the image to generate                |
| `filename` | string | No       | Custom filename (without extension). Defaults to a UUID. |

**Output:**

```json
{
  "id": "mountain-sunset",
  "url": "/images/mountain-sunset.png"
}
```

### Accessing Generated Images

Images are accessible in three ways:

1. **MCP Resources** - Listed at `images/{id}.png`, readable as base64-encoded PNGs
2. **HTTP** - Available at `http://localhost:3001/images/{id}.png`
3. **Filesystem** - Stored in the `./images/` directory

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
gemini-image-mcp/
├── server.ts          # MCP server implementation
├── package.json
├── tsconfig.json
├── images/            # Generated images directory
└── dist/              # Compiled output
```

## License

MIT
