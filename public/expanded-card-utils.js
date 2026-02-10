(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  root.expandedCardUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getExpandedAgentsInColumn(expandedCards, columnAgents) {
    if (!expandedCards || typeof expandedCards.has !== 'function') return [];
    if (!Array.isArray(columnAgents) || columnAgents.length === 0) return [];

    const visibleExpanded = [];
    for (const agent of columnAgents) {
      if (!agent || !agent.name) continue;
      if (expandedCards.has(agent.name)) {
        visibleExpanded.push(agent.name);
      }
    }
    return visibleExpanded;
  }

  return { getExpandedAgentsInColumn };
});
