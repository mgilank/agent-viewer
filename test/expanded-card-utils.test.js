const test = require('node:test');
const assert = require('node:assert/strict');

const { getExpandedAgentsInColumn } = require('../public/expanded-card-utils.js');

test('returns expanded agents that exist in the current column', () => {
  const expanded = new Set(['agent-a', 'agent-c']);
  const columnAgents = [
    { name: 'agent-a' },
    { name: 'agent-b' },
  ];

  assert.deepEqual(getExpandedAgentsInColumn(expanded, columnAgents), ['agent-a']);
});

test('returns empty array for empty/invalid inputs', () => {
  assert.deepEqual(getExpandedAgentsInColumn(new Set(['agent-a']), []), []);
  assert.deepEqual(getExpandedAgentsInColumn(new Set(['agent-a']), null), []);
  assert.deepEqual(getExpandedAgentsInColumn(null, [{ name: 'agent-a' }]), []);
});
