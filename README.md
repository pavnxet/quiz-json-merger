# Quiz JSON Merger

A powerful Cloudflare Worker that merges multiple quiz files into a single standardized quiz, fully compatible with the **Quiz HTML Compiler** (`quiz-json-to-html`) and generic JSON array formats. Supports both an interactive Web UI and a Telegram bot.

---

## 🚀 Live Demo

**[https://jsonmerge.pavneet1804.workers.dev/](https://jsonmerge.pavneet1804.workers.dev/)**

---

## ✨ Features

- **🎯 Dual Merge Modes with Toggle**:
  - **Quiz HTML Compiler Format (v1.0 Schema)** *(Default)*:
    - Generates standardized `{ schema_version: "1.0", quiz: {...}, passages: [...], questions: [...] }`.
    - Preserves and deduplicates reading comprehension passages by ID.
    - Tags questions with respective subject/topic names derived from file titles or source metadata.
    - Renumbers questions sequentially without collision.
  - **Legacy Raw Array Mode**:
    - Uncheck the toggle to output a flat array of questions `[...]` for older scripts or consumers.
- **📂 Multi-Format Ingestion**:
  - Accepts both standard `.json` quiz files and standalone exported `.html` quiz files (automatically extracts embedded `<script id="quiz-data">` blocks).
- **🖥️ Drag-and-Drop Web Interface**:
  - Visual dropzone, file list, instant custom naming, and live merge statistics.
  - Installable as a Progressive Web App (PWA) on mobile and desktop.
- **🤖 Telegram Bot**:
  - Send multiple `.json` or `.html` quiz files one by one.
  - File collection via Cloudflare KV (`PENDING_FILES`).
  - Send `/merge` to compile and receive the merged JSON quiz, or `/cancel` to clear the queue.

---

## 🛠️ Development & Deployment

1. **Clone the repository**:
   ```bash
   git clone https://github.com/pavnxet/quiz-json-merger.git
   cd quiz-json-merger
   ```

2. **Configure `wrangler.toml`**:
   Ensure your KV namespace binding is configured:
   ```toml
   name = "jsonmerge"
   main = "src/index.js"
   compatibility_date = "2026-04-22"
   preview_urls = false

   [[kv_namespaces]]
   binding = "PENDING_FILES"
   id = "594fb08fc54e4d77a2f636aa0f2a4962"
   ```

3. **Run Locally**:
   ```bash
   npx wrangler dev
   ```

4. **Deploy to Cloudflare Workers**:
   ```bash
   npx wrangler deploy
   ```

---

## 📄 License

MIT
