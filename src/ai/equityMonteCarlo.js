const { evaluate7, compareEvaluations } = require("../eval/handEvaluator");

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["s", "h", "d", "c"];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

function drawRandom(deck, rng) {
  const idx = Math.floor(rng.random() * deck.length);
  return deck.splice(idx, 1)[0];
}

function estimateEquity(params) {
  const {
    heroHole,
    board,
    deadCards = [],
    numOpponents,
    iterations,
    knownOpponentsHoles = [],
    rng = { random: Math.random },
  } = params;

  const knownHoles = knownOpponentsHoles.filter((h) => h && h.length === 2);
  const unknownOpponents = Math.max(0, numOpponents - knownHoles.length);
  const baseDeck = createDeck();
  const usedCards = new Set([
    ...heroHole,
    ...board,
    ...deadCards,
    ...knownHoles.flat(),
  ]);
  const remainingBase = baseDeck.filter((card) => !usedCards.has(card));

  let win = 0;
  let tie = 0;
  let lose = 0;
  let equity = 0;

  for (let i = 0; i < iterations; i += 1) {
    const deck = remainingBase.slice();
    const opponents = [];
    for (let k = 0; k < knownHoles.length; k += 1) {
      opponents.push(knownHoles[k]);
    }
    for (let j = 0; j < unknownOpponents; j += 1) {
      opponents.push([drawRandom(deck, rng), drawRandom(deck, rng)]);
    }

    const boardDraw = board.slice();
    while (boardDraw.length < 5) {
      boardDraw.push(drawRandom(deck, rng));
    }

    const heroEval = evaluate7([...heroHole, ...boardDraw]);
    let bestEval = heroEval;
    let winners = ["hero"];

    opponents.forEach((hole) => {
      const oppEval = evaluate7([...hole, ...boardDraw]);
      const cmp = compareEvaluations(oppEval, bestEval);
      if (cmp > 0) {
        bestEval = oppEval;
        winners = ["opponent"];
      } else if (cmp === 0) {
        winners.push("opponent");
      }
    });

    if (winners[0] === "hero" && winners.length === 1) {
      win += 1;
      equity += 1;
    } else if (winners[0] === "hero") {
      tie += 1;
      equity += 1 / winners.length;
    } else {
      lose += 1;
    }
  }

  return {
    win,
    tie,
    lose,
    equity: equity / iterations,
  };
}

module.exports = {
  estimateEquity,
};
