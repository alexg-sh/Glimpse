# Glimpse

AI-powered find-in-page extension that transforms how you search and understand web content. Press Ctrl+F to get instant AI insights about any webpage.

## Features

- **Smart Find**: Enhanced find-in-page with AI-powered search assistance
- **AI Chat**: Ask questions about page content when search yields no results
- **Model Selection**: Choose from hundreds of AI models via OpenRouter (GPT-4, Claude, Gemini, Llama, and more)
- **Beautiful UI**: Modern, transparent interface with smooth animations
- **Privacy First**: Only sends first 500 tokens of page content, settings stored locally

## Quick Start

1. **Install**: Load the extension in Chrome (`chrome://extensions/` → Developer Mode → Load unpacked)
2. **Configure**: Press **Ctrl+F** (Cmd+F on Mac) → Click **⚙** → Enter your [OpenRouter API key](https://openrouter.ai/keys) → Select a model → Save
3. **Use**: Press **Ctrl+F** on any webpage to start searching

## Usage

### Basic Search
- Press **Ctrl+F** to open the find bar
- Type to search the page
- Use **↑** and **↓** buttons to navigate matches
- Press **Esc** to close

### AI-Powered Search
- When no matches are found, click **"Ask"** to query AI about the page
- The AI analyzes page content and provides relevant information
- Continue the conversation in chat mode

### Chat Mode
- After your first AI query, the interface switches to chat mode
- Ask follow-up questions about the page content
- Click **🔍** to return to find mode
- Click **✕** to close

## Configuration

### Settings Panel
- **API Key**: Your OpenRouter API key (get one at [openrouter.ai/keys](https://openrouter.ai/keys))
- **Model Selection**: Choose from the full list of available models
- **Refresh Models**: Use the 🔄 button to reload the model list
- **Test API Key**: Verify your API key works before saving

### Model Caching
- Models are automatically fetched from OpenRouter API
- Cached for 24 hours to improve performance
- Manual refresh available via settings

## Privacy & Security

- **Minimal Data**: Only first 500 tokens of visible page text are sent to the API
- **Local Storage**: Settings (API key and model) stored locally in Chrome storage
- **No Tracking**: Extension doesn't collect or store user data
- **Direct API**: All requests go directly from your browser to OpenRouter

## Requirements

- Chrome 76+ or Edge 79+ (for backdrop-filter support)
- OpenRouter API key ([get one here](https://openrouter.ai/keys))
- Internet connection for AI features
