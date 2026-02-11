(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.promptKeyUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const OUTPUT_CONTROL_KEYS = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    Enter: 'Enter',
    Escape: 'Escape',
  };

  function shouldSendPromptOnEnter(event) {
    if (!event || event.key !== 'Enter') return false;

    // Let users insert line breaks with Shift+Enter in textarea.
    if (event.shiftKey) return false;

    // Avoid interrupting IME composition commit.
    if (event.isComposing || event.keyCode === 229) return false;

    return true;
  }

  function getOutputControlKey(event, inputValue) {
    if (!event) return null;

    const value = typeof inputValue === 'string' ? inputValue : '';
    if (value.trim() !== '') return null;

    return OUTPUT_CONTROL_KEYS[event.key] || null;
  }

  function resolveOutputOverlayKeyAction(event, inputValue, isInputFocused) {
    if (!event) return null;

    // Avoid interrupting IME composition commit.
    if (event.isComposing || event.keyCode === 229) return null;

    const focused = !!isInputFocused;
    const value = typeof inputValue === 'string' ? inputValue : '';
    const isCloseOverlayKey =
      typeof event.key === 'string'
      && event.key.toLowerCase() === 'x'
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey;

    if (!focused) {
      if (isCloseOverlayKey) {
        return { type: 'close-overlay' };
      }
      const controlKey = OUTPUT_CONTROL_KEYS[event.key] || null;
      return controlKey ? { type: 'send-key', key: controlKey } : null;
    }

    if (event.key === 'Enter' && value.trim() !== '') {
      return { type: 'send-message' };
    }

    const controlKey = getOutputControlKey(event, value);
    return controlKey ? { type: 'send-key', key: controlKey } : null;
  }

  function shouldFastRefreshOutput(payload) {
    if (!payload || typeof payload !== 'object') return false;
    return typeof payload.key === 'string' && payload.key.trim() !== '';
  }

  return {
    shouldSendPromptOnEnter,
    getOutputControlKey,
    resolveOutputOverlayKeyAction,
    shouldFastRefreshOutput,
  };
});
