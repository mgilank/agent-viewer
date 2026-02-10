(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.promptKeyUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function shouldSendPromptOnEnter(event) {
    if (!event || event.key !== 'Enter') return false;

    // Let users insert line breaks with Shift+Enter in textarea.
    if (event.shiftKey) return false;

    // Avoid interrupting IME composition commit.
    if (event.isComposing || event.keyCode === 229) return false;

    return true;
  }

  return { shouldSendPromptOnEnter };
});
