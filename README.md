# FindAI

AI-powered find-in-page Chrome extension with OpenRouter integration.

## Quick Start

1. Load the extension in Chrome (`chrome://extensions/` → Developer Mode → Load unpacked)
2. Press **Ctrl+F** (Cmd+F on Mac) on any webpage
3. Click **⚙** to open settings
4. Enter your [OpenRouter API key](https://openrouter.ai/keys) and select a model
5. Click **Save**

## Usage

- **Find**: Press Ctrl+F, type to search, use ↑↓ to navigate
- **AI Search**: When no matches found, click "Ask" to query AI about page content
- **Chat Mode**: Continue conversations with AI about the current page

## Features

- Custom find UI replacing Chrome's default find
- AI-powered search using OpenRouter (GPT-4, Claude, Gemini, etc.)
- Full model list from OpenRouter API
- Settings stored locally in Chrome storage
- Dark theme UI

## Privacy

- Only first 500 tokens of page text sent to API
- Settings stored locally only
- No data collection
