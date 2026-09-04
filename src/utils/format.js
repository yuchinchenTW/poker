const SUIT_SYMBOLS = { s: "\u2660", h: "\u2665", d: "\u2666", c: "\u2663" };
const RED_SUITS = new Set(["h", "d"]);
const ANSI_RED = "\u001b[31m";
const ANSI_RESET = "\u001b[0m";

const displayOptions = {
  unicodeSuits: true,
  color: true,
};

function configureCardDisplay(options) {
  if (!options) {
    return;
  }
  if (typeof options.unicodeSuits === "boolean") {
    displayOptions.unicodeSuits = options.unicodeSuits;
  }
  if (typeof options.color === "boolean") {
    displayOptions.color = options.color;
  }
}

// Renders an internal card code such as "Th" as "T\u2665" (red) for display.
function formatCard(card) {
  if (!card || card.length < 2) {
    return String(card);
  }
  const rank = card[0] === "T" ? "10" : card[0];
  const suit = card[1];
  if (!displayOptions.unicodeSuits) {
    return card;
  }
  const symbol = SUIT_SYMBOLS[suit] || suit;
  const text = `${rank}${symbol}`;
  if (displayOptions.color && RED_SUITS.has(suit)) {
    return `${ANSI_RED}${text}${ANSI_RESET}`;
  }
  return text;
}

function formatCards(cards) {
  if (!cards || cards.length === 0) {
    return "[]";
  }
  return `[${cards.map(formatCard).join(" ")}]`;
}

// e.g. "H:1000(D) A1:995(SB) A2:990(BB) A3:fold". `state` is optional; without
// it only name:stack is printed.
function formatStacks(players, state) {
  return players
    .map((p) => {
      if (!p.inHand) {
        return `${p.name}:OUT`;
      }
      if (p.hasFolded) {
        return `${p.name}:${p.stack}(fold)`;
      }
      const tags = [];
      if (state) {
        if (state.buttonIndex === p.id) tags.push("D");
        if (state.sbSeat === p.id) tags.push("SB");
        if (state.bbSeat === p.id) tags.push("BB");
      }
      if (p.isAllIn) tags.push("all-in");
      const suffix = tags.length ? `(${tags.join(",")})` : "";
      return `${p.name}:${p.stack}${suffix}`;
    })
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
  configureCardDisplay,
  formatCard,
  formatCards,
  formatStacks,
  formatActionLog,
};
