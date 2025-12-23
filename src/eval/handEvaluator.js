const RANK_ORDER = "23456789TJQKA";
const RANK_VALUES = RANK_ORDER.split("").reduce((acc, rank, idx) => {
  acc[rank] = idx + 2;
  return acc;
}, {});

function parseCard(card) {
  return {
    rank: RANK_VALUES[card[0]],
    suit: card[1],
  };
}

function isStraight(ranks) {
  const unique = Array.from(new Set(ranks)).sort((a, b) => b - a);
  if (unique.length !== 5) {
    return null;
  }
  const high = unique[0];
  if (high - unique[4] === 4) {
    return high;
  }
  if (
    unique[0] === 14 &&
    unique[1] === 5 &&
    unique[2] === 4 &&
    unique[3] === 3 &&
    unique[4] === 2
  ) {
    return 5;
  }
  return null;
}

function evaluateFive(cards) {
  const parsed = cards.map(parseCard);
  const ranks = parsed.map((c) => c.rank).sort((a, b) => b - a);
  const suits = parsed.map((c) => c.suit);
  const flush = suits.every((s) => s === suits[0]);
  const straightHigh = isStraight(ranks);

  const rankCounts = {};
  ranks.forEach((rank) => {
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  });

  const countEntries = Object.keys(rankCounts)
    .map((rank) => ({
      rank: Number(rank),
      count: rankCounts[rank],
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.rank - a.rank;
    });

  if (straightHigh && flush) {
    return {
      category: 8,
      tiebreak: [straightHigh],
      bestFiveCards: cards,
    };
  }

  if (countEntries[0].count === 4) {
    const quadRank = countEntries[0].rank;
    const kicker = countEntries[1].rank;
    return {
      category: 7,
      tiebreak: [quadRank, kicker],
      bestFiveCards: cards,
    };
  }

  if (countEntries[0].count === 3 && countEntries[1].count === 2) {
    return {
      category: 6,
      tiebreak: [countEntries[0].rank, countEntries[1].rank],
      bestFiveCards: cards,
    };
  }

  if (flush) {
    return {
      category: 5,
      tiebreak: ranks.slice(),
      bestFiveCards: cards,
    };
  }

  if (straightHigh) {
    return {
      category: 4,
      tiebreak: [straightHigh],
      bestFiveCards: cards,
    };
  }

  if (countEntries[0].count === 3) {
    const kickers = countEntries
      .slice(1)
      .map((e) => e.rank)
      .sort((a, b) => b - a);
    return {
      category: 3,
      tiebreak: [countEntries[0].rank, ...kickers],
      bestFiveCards: cards,
    };
  }

  if (countEntries[0].count === 2 && countEntries[1].count === 2) {
    const highPair = Math.max(countEntries[0].rank, countEntries[1].rank);
    const lowPair = Math.min(countEntries[0].rank, countEntries[1].rank);
    const kicker = countEntries[2].rank;
    return {
      category: 2,
      tiebreak: [highPair, lowPair, kicker],
      bestFiveCards: cards,
    };
  }

  if (countEntries[0].count === 2) {
    const pairRank = countEntries[0].rank;
    const kickers = countEntries
      .slice(1)
      .map((e) => e.rank)
      .sort((a, b) => b - a);
    return {
      category: 1,
      tiebreak: [pairRank, ...kickers],
      bestFiveCards: cards,
    };
  }

  return {
    category: 0,
    tiebreak: ranks.slice(),
    bestFiveCards: cards,
  };
}

function compareEvaluations(a, b) {
  if (a.category !== b.category) {
    return a.category > b.category ? 1 : -1;
  }
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i += 1) {
    const av = a.tiebreak[i] || 0;
    const bv = b.tiebreak[i] || 0;
    if (av !== bv) {
      return av > bv ? 1 : -1;
    }
  }
  return 0;
}

function combinations(cards) {
  const result = [];
  const n = cards.length;
  for (let i = 0; i < n - 4; i += 1) {
    for (let j = i + 1; j < n - 3; j += 1) {
      for (let k = j + 1; k < n - 2; k += 1) {
        for (let l = k + 1; l < n - 1; l += 1) {
          for (let m = l + 1; m < n; m += 1) {
            result.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
          }
        }
      }
    }
  }
  return result;
}

function evaluateBest(cards) {
  if (cards.length < 5) {
    throw new Error("Need at least 5 cards to evaluate.");
  }
  const combos = cards.length === 5 ? [cards] : combinations(cards);
  let best = null;
  for (const combo of combos) {
    const evaluated = evaluateFive(combo);
    if (!best || compareEvaluations(evaluated, best) > 0) {
      best = evaluated;
    }
  }
  return best;
}

function evaluate7(cards) {
  return evaluateBest(cards);
}

module.exports = {
  evaluate7,
  evaluateBest,
  compareEvaluations,
};
