const SUPPORTED_AGENT_KEYS = new Set(['Up', 'Down', 'Enter', 'Escape']);

function normalizeAgentSendPayload(body) {
  const input = body && typeof body === 'object' ? body : {};
  const rawMessage = typeof input.message === 'string' ? input.message : '';
  const message = rawMessage.trim();
  if (message) {
    return { type: 'message', message };
  }

  const rawKey = typeof input.key === 'string' ? input.key : '';
  const key = rawKey.trim();
  if (SUPPORTED_AGENT_KEYS.has(key)) {
    return { type: 'key', key };
  }

  return { type: 'invalid' };
}

module.exports = {
  normalizeAgentSendPayload,
  SUPPORTED_AGENT_KEYS,
};
