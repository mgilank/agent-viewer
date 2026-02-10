const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldSendPromptOnEnter } = require('../public/prompt-key-utils.js');

test('sends on plain Enter', () => {
  assert.equal(shouldSendPromptOnEnter({ key: 'Enter' }), true);
});

test('does not send on Shift+Enter', () => {
  assert.equal(shouldSendPromptOnEnter({ key: 'Enter', shiftKey: true }), false);
});

test('does not send while IME composition is active', () => {
  assert.equal(shouldSendPromptOnEnter({ key: 'Enter', isComposing: true }), false);
  assert.equal(shouldSendPromptOnEnter({ key: 'Enter', keyCode: 229 }), false);
});

test('does not send on non-Enter keys', () => {
  assert.equal(shouldSendPromptOnEnter({ key: 'a' }), false);
});
