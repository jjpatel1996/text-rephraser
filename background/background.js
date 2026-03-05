const BUILD_VERSION = 'v2.1';
console.log(`[Text Rephraser] Service worker loaded — ${BUILD_VERSION}`);

// ============================================================
// Tone Prompts
// ============================================================
const TONE_PROMPTS = {
  professional: 'Rephrase the following text in a professional, business-appropriate tone.',
  casual: 'Rephrase the following text in a casual, relaxed, conversational tone.',
  friendly: 'Rephrase the following text in a warm, friendly, approachable tone.',
  formal: 'Rephrase the following text in a formal, polished, respectful tone.',
  persuasive: 'Rephrase the following text in a persuasive, compelling tone.',
  concise: 'Rephrase the following text to be concise and to the point, removing unnecessary words.',
};

const SYSTEM_INSTRUCTION = 'Return only the rephrased text, nothing else. Do not add quotes or any explanation.';

// ============================================================
// Provider Configurations
// ============================================================
const PROVIDER_CONFIG = {
  openai: {
    storageKey: 'openai_api_key',
    name: 'OpenAI',
    model: 'gpt-5-mini',
  },
  claude: {
    storageKey: 'claude_api_key',
    name: 'Claude',
    model: 'claude-sonnet-4-6',
  },
  gemini: {
    storageKey: 'gemini_api_key',
    name: 'Gemini',
    model: 'gemini-3.0-flash',
  },
};

// ============================================================
// Debug Logger
// ============================================================
function log(...args) {
  console.log('[Text Rephraser]', ...args);
}
function logError(...args) {
  console.error('[Text Rephraser]', ...args);
}

// ============================================================
// Message Handler
// ============================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'rephrase') return;

  log('Received rephrase request:', { tone: request.tone, textLength: request.text.length });

  handleRephrase(request.text, request.tone)
    .then((rephrased) => {
      log('Success! Rephrased text length:', rephrased.length);
      sendResponse({ rephrased });
    })
    .catch((err) => {
      logError('Final error:', err.message);
      sendResponse({ error: err.message });
    });

  return true; // async
});

// ============================================================
// Main Handler
// ============================================================
async function handleRephrase(text, tone) {
  const result = await chrome.storage.sync.get([
    'active_provider',
    'openai_api_key',
    'claude_api_key',
    'gemini_api_key',
  ]);

  const provider = result.active_provider || 'openai';
  const config = PROVIDER_CONFIG[provider];
  const apiKey = result[config.storageKey];

  log('Provider:', provider, '| Model:', config.model, '| Key present:', !!apiKey);

  if (!apiKey) {
    throw new Error(`No ${config.name} API key set. Click the extension icon to configure.`);
  }

  const systemPrompt = TONE_PROMPTS[tone];
  if (!systemPrompt) {
    throw new Error('Unknown tone selected.');
  }

  const fullSystemPrompt = `${systemPrompt} ${SYSTEM_INSTRUCTION}`;

  // Dispatch to the right provider with retry
  return retryWithBackoff(() => {
    switch (provider) {
      case 'openai':
        return callOpenAI(apiKey, config.model, fullSystemPrompt, text);
      case 'claude':
        return callClaude(apiKey, config.model, fullSystemPrompt, text);
      case 'gemini':
        return callGemini(apiKey, config.model, fullSystemPrompt, text);
      default:
        throw new Error('Unknown provider.');
    }
  });
}

// ============================================================
// OpenAI
// ============================================================
async function callOpenAI(apiKey, model, systemPrompt, userText) {
  log('Calling OpenAI...', { model });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  log('OpenAI response status:', response.status);

  if (!response.ok) {
    await handleHttpError(response, 'OpenAI');
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('No response from OpenAI.');
  return text;
}

// ============================================================
// Claude (Anthropic)
// ============================================================
async function callClaude(apiKey, model, systemPrompt, userText) {
  log('Calling Claude...', { model });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    }),
  });

  log('Claude response status:', response.status);

  if (!response.ok) {
    await handleHttpError(response, 'Claude');
  }

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim();
  if (!text) throw new Error('No response from Claude.');
  return text;
}

// ============================================================
// Gemini (Google)
// ============================================================
async function callGemini(apiKey, model, systemPrompt, userText) {
  log('Calling Gemini...', { model });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userText }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    }),
  });

  log('Gemini response status:', response.status);

  if (!response.ok) {
    await handleHttpError(response, 'Gemini');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('No response from Gemini.');
  return text;
}

// ============================================================
// Error Handling — reads response body for real error message
// ============================================================
async function handleHttpError(response, providerName) {
  const status = response.status;
  let errorMessage = '';
  let errorBody = null;

  // Read the actual error body from the API
  try {
    errorBody = await response.json();
    // OpenAI: { error: { message, type, code } }
    // Claude: { error: { type, message } }
    // Gemini: { error: { message, status, code } }
    errorMessage = errorBody?.error?.message || '';
  } catch {
    // Body wasn't JSON
  }

  log(`HTTP ${status} from ${providerName}:`, errorMessage || '(no message)');
  if (errorBody) log('Full error body:', JSON.stringify(errorBody));

  // --- 401 / 403: Bad key ---
  if (status === 401 || status === 403) {
    throw new ApiError(
      errorMessage || `Invalid ${providerName} API key. Check your key in settings.`,
      status,
      false
    );
  }

  // --- 429: Rate limit OR quota exhausted ---
  if (status === 429) {
    const msg = errorMessage.toLowerCase();

    // Quota/billing issues are NOT retryable — the key has no credits
    // Be specific: only match quota/billing keywords, NOT generic "rate limit exceeded"
    const isQuotaIssue =
      msg.includes('quota') ||
      msg.includes('billing') ||
      msg.includes('insufficient_quota') ||
      msg.includes('spending limit') ||
      (msg.includes('limit') && msg.includes('account'));

    if (isQuotaIssue) {
      logError('Quota/billing issue detected (NOT retryable):', errorMessage);
      throw new ApiError(
        `${providerName}: ${errorMessage || 'Quota exceeded. Check your billing/plan.'}`,
        status,
        false
      );
    }

    // Actual rate limit — retryable
    log('Rate limit hit (will retry):', errorMessage);
    throw new ApiError(
      `${providerName} rate limit hit. Retrying...`,
      status,
      true
    );
  }

  // --- 529: Overloaded (Anthropic-specific) ---
  if (status === 529) {
    throw new ApiError(
      `${providerName} is overloaded. Retrying...`,
      status,
      true
    );
  }

  // --- 5xx: Server errors — retryable ---
  if (status >= 500) {
    throw new ApiError(
      `${providerName} service error (${status}). Retrying...`,
      status,
      true
    );
  }

  // --- Everything else (400, 404, etc.) ---
  throw new ApiError(
    errorMessage || `${providerName} request failed (${status}).`,
    status,
    false
  );
}

class ApiError extends Error {
  constructor(message, status, retryable) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

// ============================================================
// Retry with Exponential Backoff
// ============================================================
async function retryWithBackoff(fn, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) log(`Retry attempt ${attempt}/${maxRetries}...`);
      return await fn();
    } catch (err) {
      lastError = err;

      // Don't retry non-retryable errors (bad key, quota, unknown)
      if (err instanceof ApiError && !err.retryable) {
        logError('Non-retryable error, giving up:', err.message);
        throw err;
      }

      // Don't retry after max attempts
      if (attempt === maxRetries) {
        logError(`All ${maxRetries} retries exhausted.`);
        break;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      log(`Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }

  // All retries exhausted — show the real API error
  const finalMessage =
    lastError?.message?.replace('Retrying...', 'Please try again later.') ||
    'Request failed after multiple retries.';
  throw new Error(finalMessage);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
