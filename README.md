# Text Rephraser

A Chrome extension that rephrases selected text in any input field using AI. Choose from six tones (Professional, Casual, Friendly, Formal, Persuasive, Concise) and use OpenAI, Claude, or Gemini as your provider.

## How It Works

1. **Select text** in any editable field — a text input, textarea, or contenteditable area (e.g. Gmail compose, Slack, Notion).
2. **Toolbar appears** — a floating “Rephrase” button shows near your selection.
3. **Pick a tone** — click Rephrase, then choose: Professional, Casual, Friendly, Formal, Persuasive, or Concise.
4. **AI rephrases** — the extension sends the selected text to your chosen AI provider (OpenAI, Claude, or Gemini) and replaces the selection with the rephrased result.

**Under the hood:**

- **Content script** runs on all pages, detects text selection in editable fields, and shows the toolbar. When you pick a tone, it sends the selection to the extension and then replaces the text with the response.
- **Background service worker** receives the request, reads your saved API key and provider from storage, calls the provider’s API with a tone-specific prompt, and returns the rephrased text. It uses retries with exponential backoff for rate limits and transient errors.
- **Popup** (click the extension icon) lets you choose AI provider (OpenAI / Claude / Gemini) and save your API key. Keys are stored in Chrome’s sync storage and never leave your browser except to call the provider’s API.

You need an API key from at least one provider; get keys from [OpenAI](https://platform.openai.com), [Anthropic](https://console.anthropic.com), or [Google AI Studio](https://aistudio.google.com).

## Install in Chrome (Developer Mode)

1. **Open the Extensions page**
   - In the address bar, go to: `chrome://extensions`

2. **Turn on Developer mode**
   - Toggle **Developer mode** on (top-right of the page).

3. **Load the extension**
   - Click **Load unpacked**.
   - Choose the folder that contains this project (the folder with `manifest.json` inside it).
   - The extension should appear in your list and its icon in the toolbar.

4. **Configure**
   - Click the extension icon, pick an AI provider, enter your API key, and click **Save Settings**.

5. **Use it**
   - Go to any page, select text in an input or text area, and use the Rephrase toolbar to rewrite it in your chosen tone.

**Note:** Unpacked extensions stay installed until you remove them or delete the folder. If you change the extension’s files, go to `chrome://extensions` and click the refresh icon on the Text Rephraser card to reload it.

## License

MIT © 2026 Jay Patel
