# Product Detector

A browser extension that detects and highlights product mentions in forum and
discussion threads (built for Reddit, works on other discussion sites too).
Detected products are highlighted inline, and hovering one shows a card with
product info and an image.

Built with [WXT](https://wxt.dev/), React 19, and TypeScript.

## How it works

- A content script scans comments/posts and uses an LLM to identify product
  mentions, then highlights them in place.
- Hovering a highlight shows a `HoverCard` with product details and an image.
- Detection and product-info results are cached to avoid redundant LLM calls.
- A comment observer picks up newly loaded comments as you scroll.

## AI providers

The extension is **bring-your-own-key (BYOK)** — no keys are bundled or shipped.
Keys are entered in the popup and stored locally in `browser.storage.local` on
your machine.

Supported providers:

- **Chrome built-in AI** (on-device, no key required)
- **OpenAI** (BYOK)
- **Anthropic** (BYOK)
- **Google Gemini** (BYOK)

Optional: a [Serper](https://serper.dev/) API key enables product image search.

## Development

```bash
npm install

# Run in dev mode (Chrome)
npm run dev

# Run in dev mode (Firefox)
npm run dev:firefox

# Type-check
npm run typecheck
```

## Build

```bash
# Production build (Chrome)
npm run build

# Production build (Firefox)
npm run build:firefox

# Package as a zip for store submission
npm run zip
```

Build output is written to `.output/`.

## Project structure

```
entrypoints/
  background.ts        # extension background/service worker
  content.tsx          # content script injected into pages
  popup/               # extension popup UI (settings, API keys)
components/            # React UI (HoverCard, ProductDetectorApp)
contexts/              # React context (portal target)
utils/
  product-detector.ts  # core detection logic
  comment-observer.ts  # watches for newly loaded comments
  *-cache.ts           # detection + product-info caching
  providers/           # LLM provider integrations (chrome-ai, byok, manager)
```

## Privacy

API keys never leave your browser — they're stored locally and used only to
call the provider you configured. Page content is sent to the AI provider you
choose for the purpose of detecting product mentions.

## License

ISC
