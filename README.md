# Gemini Image MCP

An MCP (Model Context Protocol) server optimized for web development that enables AI assistants to generate and edit images using Google's Gemini API.

## Features

- **Image Generation** - Generate images with aspect ratio presets (hero, square, portrait, landscape, banner, mobile) and resolutions up to 4K
- **Image Editing** - Edit existing images in your workspace with natural language
- **Web-Optimized** - Presets designed for common web development use cases
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

## Tools

### `generate_image`

Generate an image from a text prompt with web-optimized aspect ratios and resolutions.

| Parameter     | Type   | Required | Description                                                                                                                    |
| ------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `prompt`      | string | Yes      | Text description of the image to generate                                                                                      |
| `filename`    | string | No       | Custom filename (without extension). Defaults to UUID.                                                                         |
| `aspectRatio` | string | No       | Preset: `hero` (16:9), `square` (1:1), `portrait` (3:4), `landscape` (4:3), `banner` (21:9), `mobile` (9:16) or explicit ratio |
| `resolution`  | string | No       | `1K` (default), `2K`, or `4K`                                                                                                  |

**Example:**

```json
{
  "prompt": "A modern hero image for a tech startup website with abstract geometric shapes",
  "filename": "hero-image",
  "aspectRatio": "hero",
  "resolution": "2K"
}
```

**Output:**

```json
{
  "id": "hero-image",
  "url": "/images/hero-image.png",
  "aspectRatio": "16:9",
  "resolution": "2K"
}
```

### `edit_image`

Edit an existing image in your workspace using natural language.

| Parameter     | Type   | Required | Description                                             |
| ------------- | ------ | -------- | ------------------------------------------------------- |
| `prompt`      | string | Yes      | Description of what to change                           |
| `sourceImage` | string | Yes      | Path to the source image file in the workspace          |
| `filename`    | string | No       | Custom filename for the edited image. Defaults to UUID. |
| `aspectRatio` | string | No       | Optionally change aspect ratio during edit              |
| `resolution`  | string | No       | `1K` (default), `2K`, or `4K`                           |

**Example:**

```json
{
  "prompt": "Change the background color to a gradient of blue and purple",
  "sourceImage": "/path/to/original-image.png",
  "filename": "edited-hero"
}
```

## Aspect Ratio Presets

| Preset      | Ratio | Common Use Case            |
| ----------- | ----- | -------------------------- |
| `hero`      | 16:9  | Hero sections, headers     |
| `square`    | 1:1   | Thumbnails, avatars, icons |
| `portrait`  | 3:4   | Cards, profile images      |
| `landscape` | 4:3   | Blog images, galleries     |
| `banner`    | 21:9  | Wide banners, headers      |
| `mobile`    | 9:16  | Mobile screens, stories    |

## Accessing Generated Images

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
