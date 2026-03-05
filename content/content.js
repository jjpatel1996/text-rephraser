(() => {
  const TONES = [
    { id: 'professional', label: 'Professional', icon: '💼' },
    { id: 'casual', label: 'Casual', icon: '😊' },
    { id: 'friendly', label: 'Friendly', icon: '🤝' },
    { id: 'formal', label: 'Formal', icon: '🎩' },
    { id: 'persuasive', label: 'Persuasive', icon: '🎯' },
    { id: 'concise', label: 'Concise', icon: '✂️' },
  ];

  let toolbarHost = null;
  let shadowRoot = null;
  let activeElement = null;
  let selectedText = '';
  let selectionStart = 0;
  let selectionEnd = 0;

  function createToolbar() {
    toolbarHost = document.createElement('div');
    toolbarHost.id = 'rephrase-toolbar-host';
    document.body.appendChild(toolbarHost);

    shadowRoot = toolbarHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .toolbar {
        display: none;
        background: #1a1a2e;
        border: 1px solid #2a2a4a;
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        padding: 6px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: fadeIn 0.15s ease-out;
      }
      .toolbar.visible { display: block; }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .trigger-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: #6c63ff;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.15s;
      }
      .trigger-btn:hover { background: #5a52d5; }
      .trigger-btn svg { width: 14px; height: 14px; }

      .tones-panel {
        display: none;
        padding-top: 6px;
      }
      .tones-panel.visible { display: block; }

      .tone-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 7px 10px;
        background: transparent;
        color: #e0e0e0;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        text-align: left;
        transition: background 0.15s;
      }
      .tone-btn:hover { background: #16213e; }
      .tone-btn .icon { font-size: 14px; }

      .loading {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        color: #888;
        font-size: 12px;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid #333;
        border-top-color: #6c63ff;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      .error-msg {
        padding: 8px 12px;
        color: #f87171;
        font-size: 11px;
        max-width: 220px;
      }
    `;

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';

    // Trigger button
    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'trigger-btn';
    triggerBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
      Rephrase
    `;

    // Tones panel
    const tonesPanel = document.createElement('div');
    tonesPanel.className = 'tones-panel';

    TONES.forEach(tone => {
      const btn = document.createElement('button');
      btn.className = 'tone-btn';
      btn.innerHTML = `<span class="icon">${tone.icon}</span> ${tone.label}`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleToneSelect(tone.id, toolbar, tonesPanel);
      });
      tonesPanel.appendChild(btn);
    });

    // Loading indicator
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.style.display = 'none';
    loading.innerHTML = '<div class="spinner"></div> Rephrasing...';

    // Error message
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-msg';
    errorMsg.style.display = 'none';

    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tonesPanel.classList.toggle('visible');
    });

    toolbar.appendChild(triggerBtn);
    toolbar.appendChild(tonesPanel);
    toolbar.appendChild(loading);
    toolbar.appendChild(errorMsg);

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(toolbar);

    return { toolbar, tonesPanel, loading, errorMsg, triggerBtn };
  }

  const elements = createToolbar();

  function showToolbar(x, y) {
    elements.tonesPanel.classList.remove('visible');
    elements.loading.style.display = 'none';
    elements.errorMsg.style.display = 'none';
    elements.triggerBtn.style.display = '';

    toolbarHost.style.left = `${x}px`;
    toolbarHost.style.top = `${y}px`;
    elements.toolbar.classList.add('visible');
  }

  function hideToolbar() {
    elements.toolbar.classList.remove('visible');
    elements.tonesPanel.classList.remove('visible');
  }

  function getSelectionFromInput(el) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) return null;
    return {
      text: el.value.substring(start, end),
      start,
      end,
    };
  }

  function getSelectionFromContentEditable() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = sel.toString().trim();
    if (!text) return null;
    return { text, range: sel.getRangeAt(0) };
  }

  function isEditableField(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT' && ['text', 'search', 'email', 'url'].includes(el.type)) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  // Listen for mouseup to detect text selection in editable fields
  document.addEventListener('mouseup', (e) => {
    // Ignore clicks inside our toolbar
    if (toolbarHost.contains(e.target)) return;

    const target = e.target;

    // Small delay to let the selection settle
    setTimeout(() => {
      if (!isEditableField(target)) {
        hideToolbar();
        return;
      }

      let selection = null;

      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        selection = getSelectionFromInput(target);
      } else if (target.isContentEditable) {
        selection = getSelectionFromContentEditable();
      }

      if (!selection || !selection.text) {
        hideToolbar();
        return;
      }

      activeElement = target;
      selectedText = selection.text;
      selectionStart = selection.start;
      selectionEnd = selection.end;

      // Position toolbar near the cursor
      const rect = target.getBoundingClientRect();
      const x = e.pageX;
      const y = e.pageY - 45;

      showToolbar(x, y);
    }, 10);
  });

  // Hide toolbar when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (toolbarHost.contains(e.target)) return;
    // Check if click is inside shadow DOM
    const path = e.composedPath();
    if (path.includes(toolbarHost)) return;
    hideToolbar();
  });

  function handleToneSelect(tone, toolbar, tonesPanel) {
    // Show loading
    elements.triggerBtn.style.display = 'none';
    tonesPanel.classList.remove('visible');
    elements.loading.style.display = 'flex';
    elements.errorMsg.style.display = 'none';

    // Send message to background script
    chrome.runtime.sendMessage(
      { action: 'rephrase', text: selectedText, tone },
      (response) => {
        elements.loading.style.display = 'none';

        if (chrome.runtime.lastError) {
          showError('Extension error. Please reload the page.');
          return;
        }

        if (response.error) {
          showError(response.error);
          return;
        }

        replaceText(response.rephrased);
        hideToolbar();
      }
    );
  }

  function showError(msg) {
    elements.errorMsg.textContent = msg;
    elements.errorMsg.style.display = 'block';
    elements.triggerBtn.style.display = '';

    setTimeout(() => {
      elements.errorMsg.style.display = 'none';
    }, 4000);
  }

  function replaceText(newText) {
    if (!activeElement) return;

    if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
      const value = activeElement.value;
      activeElement.value =
        value.substring(0, selectionStart) + newText + value.substring(selectionEnd);

      // Trigger input event so frameworks (React, Vue, etc.) detect the change
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      activeElement.dispatchEvent(new Event('change', { bubbles: true }));

      // Set cursor at the end of replaced text
      const newCursorPos = selectionStart + newText.length;
      activeElement.setSelectionRange(newCursorPos, newCursorPos);
      activeElement.focus();
    } else if (activeElement.isContentEditable) {
      // For contenteditable, use execCommand for undo support
      activeElement.focus();
      const sel = window.getSelection();
      if (sel.rangeCount) {
        // Try to restore the original selection range
        document.execCommand('insertText', false, newText);
      }
    }
  }
})();
