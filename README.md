# Markdown Renderer

A lightweight, browser-based markdown renderer with real-time preview, syntax highlighting, and URL sharing.

## Features

- **Real-time Rendering** - Instant markdown preview with syntax highlighting
- **Mermaid Diagrams** - Render flowcharts, sequence diagrams, and class diagrams
- **Dark Mode** - Toggle between light and dark themes
- **URL Sharing** - Share rendered markdown via compressed URL (60-75% compression)
- **Syntax Highlighting** - Code blocks with Prism.js support for multiple languages
- **Export Diagrams** - Copy Mermaid diagrams as PNG images
- **JSON Formatter** - Format, minify, copy, share, and browse JSON in a tree view, with JSONC support (`//` and `/* */` comments plus trailing commas)
- **Responsive Design** - Works on desktop and mobile

## How to Use

### Basic Usage

1. **Write Markdown** - Paste or type your markdown content in the editor
2. **Render** - Click "Render Markdown" or press `Ctrl/Cmd + Enter`
3. **View** - See the beautifully formatted output below

### Share Your Work

1. Write your markdown content
2. Click the **Share** button
3. URL is automatically copied to clipboard
4. Share the URL - recipients see the rendered markdown instantly

### Supported Markdown

- Headers (H1-H6)
- Bold, italic, strikethrough
- Lists (ordered, unordered, task lists)
- Code blocks with syntax highlighting
- Tables
- Blockquotes
- Links and images
- Mermaid diagrams (flowcharts, sequence diagrams, class diagrams)

### JSON Formatter (JSONC)

The **JSON** tab formats, minifies, copies, and shares JSON — and accepts JSONC, the
dialect used by most config files:

- **Line comments** (`// ...`) and **block comments** (`/* ... */`) are preserved and rendered in the
  formatted output (muted italic); the tree view shows them as annotations on the entry they belong to
- **Trailing commas** in objects and arrays are tolerated and normalized away in the output
- Plain JSON behaves exactly as before, and **Minify** always returns plain comment-free JSON
- Malformed input still reports an error, now with the line and column of the problem

## Live Demo

Visit: [https://sultanfariz.github.io/markdown-renderer/](https://sultanfariz.github.io/markdown-renderer/)

## Tech Stack

- [Marked.js](https://marked.js.org/) - Markdown parser
- [Mermaid.js](https://mermaid.js.org/) - Diagram rendering
- [Prism.js](https://prismjs.com/) - Syntax highlighting
- [Pako](https://github.com/nodeca/pako) - Compression for URL sharing
- [Tailwind CSS](https://tailwindcss.com/) - Styling

## License

MIT
