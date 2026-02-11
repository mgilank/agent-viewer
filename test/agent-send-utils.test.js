const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeAgentSendPayload,
} = require('../agent-send-utils.js');

test('normalizes non-empty message payload', () => {
  assert.deepEqual(
    normalizeAgentSendPayload({ message: '  hello world  ' }),
    { type: 'message', message: 'hello world' }
  );
});

test('normalizes supported key payload', () => {
  assert.deepEqual(
    normalizeAgentSendPayload({ key: 'Down' }),
    { type: 'key', key: 'Down' }
  );
  assert.deepEqual(
    normalizeAgentSendPayload({ key: 'Escape' }),
    { type: 'key', key: 'Escape' }
  );
});

test('prefers message payload over key when both are provided', () => {
  assert.deepEqual(
    normalizeAgentSendPayload({ message: 'go', key: 'Enter' }),
    { type: 'message', message: 'go' }
  );
});

test('rejects unsupported key payload', () => {
  assert.deepEqual(
    normalizeAgentSendPayload({ key: 'ArrowLeft' }),
    { type: 'invalid' }
  );
});

test('rejects empty payload', () => {
  assert.deepEqual(
    normalizeAgentSendPayload({ message: '   ' }),
    { type: 'invalid' }
  );
});
