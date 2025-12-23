function formatCards(cards) {
  if (!cards || cards.length === 0) {
    return "[]";
  }
  return `[${cards.join(" ")}]`;
}

function formatStacks(players) {
  return players
    .map((p) => `${p.name}:${p.stack}`)
    .join(" ");
}

function formatActionLog(log, limit) {
  if (!Array.isArray(log)) {
    return "";
  }
  const slice = limit ? log.slice(-limit) : log;
  return slice.join("\n");
}

module.exports = {
  formatCards,
  formatStacks,
  formatActionLog,
};
