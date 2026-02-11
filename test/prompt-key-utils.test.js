const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldSendPromptOnEnter,
  getOutputControlKey,
  resolveOutputOverlayKeyAction,
} = require('../public/prompt-key-utils.js');

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

test('maps ArrowUp to Up control key when output input is empty', () => {
  assert.equal(getOutputControlKey({ key: 'ArrowUp' }, ''), 'Up');
});

test('maps ArrowDown to Down control key when output input is empty', () => {
  assert.equal(getOutputControlKey({ key: 'ArrowDown' }, '   '), 'Down');
});

test('maps Enter to Enter control key when output input is empty', () => {
  assert.equal(getOutputControlKey({ key: 'Enter' }, ''), 'Enter');
});

test('maps Escape to Escape control key when output input is empty', () => {
  assert.equal(getOutputControlKey({ key: 'Escape' }, ''), 'Escape');
});

test('does not map control key when output input has text', () => {
  assert.equal(getOutputControlKey({ key: 'ArrowUp' }, 'hello'), null);
  assert.equal(getOutputControlKey({ key: 'Enter' }, 'send this'), null);
  assert.equal(getOutputControlKey({ key: 'Escape' }, 'send this'), null);
});

test('does not map unsupported output keys', () => {
  assert.equal(getOutputControlKey({ key: 'ArrowLeft' }, ''), null);
});

test('resolves overlay key action for ArrowDown when input is not focused', () => {
  assert.deepEqual(
    resolveOutputOverlayKeyAction({ key: 'ArrowDown' }, 'draft message', false),
    { type: 'send-key', key: 'Down' }
  );
});

test('resolves overlay key action for Enter to send message when typing', () => {
  assert.deepEqual(
    resolveOutputOverlayKeyAction({ key: 'Enter' }, 'hello', true),
    { type: 'send-message' }
  );
});

test('resolves overlay key action for Enter to send key when not typing', () => {
  assert.deepEqual(
    resolveOutputOverlayKeyAction({ key: 'Enter' }, '', false),
    { type: 'send-key', key: 'Enter' }
  );
});

test('resolves overlay key action for Escape when input is empty', () => {
  assert.deepEqual(
    resolveOutputOverlayKeyAction({ key: 'Escape' }, '', true),
    { type: 'send-key', key: 'Escape' }
  );
});

test('does not resolve overlay key action while IME composition is active', () => {
  assert.equal(
    resolveOutputOverlayKeyAction({ key: 'Enter', isComposing: true }, '', true),
    null
  );
  assert.equal(
    resolveOutputOverlayKeyAction({ key: 'Enter', keyCode: 229 }, '', true),
    null
  );
});
