# Quiz JSON Merger

A Cloudflare Worker that merges multiple JSON quiz files into one, with both a web interface and Telegram bot support.

## Features

- **Web Interface**: Drag & drop multiple JSON files and merge them instantly.
- **Telegram Bot**: Send JSON files to a bot, use `/merge` to combine them, or `/cancel` to clear.
- **PWA Support**: Installable on mobile devices for offline access.
- **Stateful Telegram Sessions**: Collects files from a user before merging.

## Live Demo

[https://jsonmerge.pavneet1804.workers.dev/](https://jsonmerge.pavneet1804.workers.dev/)

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in `wrangler.toml`:
   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token.
   - `TELEGRAM_WEBHOOK_URL`: The full URL to your worker's webhook endpoint.
   - `PENDING_FILES`: A KV namespace binding for storing user sessions.

3. Run locally:
   ```bash
   npx wrangler dev
   ```

4. Deploy:
   ```bash
   npx wrangler deploy
   ```

## License

MIT
