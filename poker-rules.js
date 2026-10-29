/* Règles de calcul isolées pour pouvoir être testées automatiquement avec Node.js. */
(function (root) {
  "use strict";
  function calculateSidePots(players) {
    const levels = [...new Set(players.map(p => Math.max(0, Number(p.handBet) || 0)).filter(v => v > 0))].sort((a, b) => a - b);
    let previous = 0;
    return levels.map(level => {
      const contributors = players.filter(p => (Number(p.handBet) || 0) >= level);
      const amount = (level - previous) * contributors.length;
      previous = level;
      return {
        amount,
        cap: level,
        eligible: players.filter(p => !p.folded && !p.eliminated && (Number(p.handBet) || 0) >= level)
      };
    }).filter(pot => pot.amount > 0);
  }
  function getUncalledExcess(players) {
    const ranked = players.map((player, index) => ({ player, index, amount: Math.max(0, Number(player.handBet) || 0) })).sort((a, b) => b.amount - a.amount);
    if (ranked.length < 2 || ranked[0].amount <= ranked[1].amount) return null;
    return { player: ranked[0].player, amount: ranked[0].amount - ranked[1].amount };
  }
  function isRaiseReopened(player, currentBet) {
    if (!player.acted) return true;
    const actedAt = Number(player.lastActedBet) || 0;
    const minimumReopen = Number(player.lastActedRaiseSize) || 0;
    return currentBet - actedAt >= minimumReopen && minimumReopen > 0;
  }
  function splitPot(amount, winners) {
    if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isInteger(winners) || winners < 1) throw new Error("Répartition du pot invalide");
    const share = Math.floor(amount / winners);
    return Array.from({ length: winners }, (_, i) => share + (i < amount % winners ? 1 : 0));
  }
  const api = { calculateSidePots, getUncalledExcess, isRaiseReopened, splitPot };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PokerRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
