const PROVIDERS = {
  openai: {
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    hint: 'Get your key from platform.openai.com',
    storageKey: 'openai_api_key',
    validate: (key) => key.startsWith('sk-'),
    validateMsg: 'Invalid key format. Should start with sk-',
  },
  claude: {
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-...',
    hint: 'Get your key from console.anthropic.com',
    storageKey: 'claude_api_key',
    validate: (key) => key.startsWith('sk-'),
    validateMsg: 'Invalid key format. Should start with sk-',
  },
  gemini: {
    label: 'Gemini API Key',
    placeholder: 'AI...',
    hint: 'Get your key from aistudio.google.com',
    storageKey: 'gemini_api_key',
    validate: () => true,
    validateMsg: '',
  },
};

const apiKeyInput = document.getElementById('api-key');
const saveBtn = document.getElementById('save-btn');
const removeBtn = document.getElementById('remove-btn');
const statusEl = document.getElementById('status');
const toggleBtn = document.getElementById('toggle-visibility');
const keyLabel = document.getElementById('key-label');
const keyHint = document.getElementById('key-hint');
const providerStatusEl = document.getElementById('provider-status');
const providerTabs = document.querySelectorAll('.provider-tab');

let activeProvider = 'openai';

// Load saved state
chrome.storage.sync.get(
  ['active_provider', 'openai_api_key', 'claude_api_key', 'gemini_api_key'],
  (result) => {
    if (result.active_provider) {
      activeProvider = result.active_provider;
    }

    updateProviderTabs(result);
    updateProviderBadges(result);
    setActiveTab(activeProvider);

    const currentKey = result[PROVIDERS[activeProvider].storageKey];
    if (currentKey) {
      apiKeyInput.value = currentKey;
    }

    updateRemoveButton(result);
  }
);

// Provider tab click
providerTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const provider = tab.dataset.provider;
    activeProvider = provider;
    setActiveTab(provider);

    chrome.storage.sync.get([PROVIDERS[provider].storageKey], (result) => {
      apiKeyInput.value = result[PROVIDERS[provider].storageKey] || '';
      updateRemoveButton(result);
    });
  });
});

function setActiveTab(provider) {
  providerTabs.forEach((t) => t.classList.remove('active'));
  document.querySelector(`[data-provider="${provider}"]`).classList.add('active');

  const config = PROVIDERS[provider];
  keyLabel.textContent = config.label;
  apiKeyInput.placeholder = config.placeholder;
  keyHint.textContent = config.hint;
  apiKeyInput.type = 'password';

  statusEl.className = 'status hidden';
}

// Show/hide remove button based on whether current provider has a saved key
function updateRemoveButton(storageResult) {
  const key = storageResult[PROVIDERS[activeProvider].storageKey];
  if (key) {
    removeBtn.classList.remove('hidden');
  } else {
    removeBtn.classList.add('hidden');
  }
}

// Save
saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  const config = PROVIDERS[activeProvider];

  if (!key) {
    showStatus('Please enter an API key', 'error');
    return;
  }

  if (!config.validate(key)) {
    showStatus(config.validateMsg, 'error');
    return;
  }

  const saveData = {
    [config.storageKey]: key,
    active_provider: activeProvider,
  };

  chrome.storage.sync.set(saveData, () => {
    // Verify the save actually worked by reading it back
    chrome.storage.sync.get(['active_provider', config.storageKey], (verify) => {
      console.log('[Text Rephraser Popup] Saved and verified:', {
        active_provider: verify.active_provider,
        keyStored: !!verify[config.storageKey],
        keyPrefix: verify[config.storageKey]?.substring(0, 8) + '...',
      });
    });

    showStatus(
      `${capitalize(activeProvider)} key saved! Set as active provider.`,
      'success'
    );
    refreshAll();
  });
});

// Remove key
removeBtn.addEventListener('click', () => {
  const config = PROVIDERS[activeProvider];

  chrome.storage.sync.remove([config.storageKey], () => {
    apiKeyInput.value = '';

    // If the removed provider was the active one, try to fall back to another configured provider
    chrome.storage.sync.get(
      ['active_provider', 'openai_api_key', 'claude_api_key', 'gemini_api_key'],
      (result) => {
        // Find another provider that still has a key
        let fallback = null;
        for (const [id, cfg] of Object.entries(PROVIDERS)) {
          if (id !== activeProvider && result[cfg.storageKey]) {
            fallback = id;
            break;
          }
        }

        if (result.active_provider === activeProvider) {
          if (fallback) {
            chrome.storage.sync.set({ active_provider: fallback });
            showStatus(
              `${capitalize(activeProvider)} key removed. Switched to ${capitalize(fallback)}.`,
              'success'
            );
          } else {
            chrome.storage.sync.remove(['active_provider']);
            showStatus(`${capitalize(activeProvider)} key removed.`, 'success');
          }
        } else {
          showStatus(`${capitalize(activeProvider)} key removed.`, 'success');
        }

        refreshAll();
      }
    );
  });
});

// Toggle visibility
toggleBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function refreshAll() {
  chrome.storage.sync.get(
    ['openai_api_key', 'claude_api_key', 'gemini_api_key'],
    (result) => {
      updateProviderTabs(result);
      updateProviderBadges(result);
      updateRemoveButton(result);
    }
  );
}

function updateProviderTabs(result) {
  providerTabs.forEach((tab) => {
    const provider = tab.dataset.provider;
    const key = result[PROVIDERS[provider].storageKey];
    if (key) {
      tab.classList.add('configured');
    } else {
      tab.classList.remove('configured');
    }
  });
}

function updateProviderBadges(result) {
  providerStatusEl.innerHTML = '';

  Object.entries(PROVIDERS).forEach(([id, config]) => {
    const hasKey = !!result[config.storageKey];
    const badge = document.createElement('div');
    badge.className = `provider-badge${hasKey ? ' active' : ''}`;
    badge.innerHTML = `<span class="dot"></span> ${capitalize(id)}`;
    providerStatusEl.appendChild(badge);
  });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
