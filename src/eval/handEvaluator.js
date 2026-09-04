// 7-card (5..7) hand evaluator. Direct rank/suit counting instead of
// enumerating all 21 five-card combinations, which makes Monte Carlo
// equity estimation an order of magnitude faster.
//
// Result shape (unchanged from the combinatorial version):
//   category: 0 High Card .. 8 Straight Flush
//   tiebreak: ranks to compare within a category (higher is better)
//   bestFiveCards: the five cards that make the hand (for display)

const RANK_ORDER = "23456789TJQKA";
const RANK_VALUES = RANK_ORDER.split("").reduce((acc, rank, idx) => {
  acc[rank] = idx + 2;
  return acc;
}, {});

const CATEGORY_NAMES = [
  "High Card",
  "Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
];

const RANK_NAMES = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Jack",
  12: "Queen",
  13: "King",
  14: "Ace",
};

function rankOf(card) {
  return RANK_VALUES[card[0]];
}

function suitOf(card) {
  return card[1];
}

// Returns the high card of the best straight in a rank bitmask, or 0.
// Bit r is set when rank r (2..14) is present; the ace also sets bit 1 so
// the wheel (A-2-3-4-5) is found as a 5-high straight.
function straightHighFromMask(mask) {
  let m = mask;
  if (m & (1 << 14)) {
    m |= 1 << 1;
  }
  for (let high = 14; high >= 5; high -= 1) {
    const window = 0b11111 << (high - 4);
    if ((m & window) === window) {
      return high;
    }
  }
  return 0;
}

// Picks `count` cards of the given rank from `pool` (optionally restricted
// to one suit), removing them from the pool.
function takeRank(pool, rank, count, suit) {
  const picked = [];
  for (let i = 0; i < pool.length && picked.length < count; i += 1) {
    const card = pool[i];
    if (rankOf(card) === rank && (!suit || suitOf(card) === suit)) {
      picked.push(card);
      pool.splice(i, 1);
      i -= 1;
    }
  }
  return picked;
}

function straightCards(pool, high, suit) {
  const cards = [];
  for (let offset = 0; offset < 5; offset += 1) {
    let rank = high - offset;
    if (rank === 1) {
      rank = 14; // wheel: the ace plays low
    }
    cards.push(...takeRank(pool, rank, 1, suit));
  }
  return cards;
}

function evaluateBest(cards) {
  if (!cards || cards.length < 5) {
    throw new Error("Need at least 5 cards to evaluate.");
  }
  if (cards.length > 7) {
    throw new Error("Evaluator supports at most 7 cards.");
  }

  const rankCount = new Array(15).fill(0);
  const suitCount = { s: 0, h: 0, d: 0, c: 0 };
  let rankMask = 0;
  for (const card of cards) {
    const r = rankOf(card);
    rankCount[r] += 1;
    suitCount[suitOf(card)] += 1;
    rankMask |= 1 << r;
  }

  // Flush / straight flush. With at most 7 cards a flush cannot coexist
  // with quads or a full house, so only a straight flush can beat it.
  let flushSuit = null;
  for (const suit of ["s", "h", "d", "c"]) {
    if (suitCount[suit] >= 5) {
      flushSuit = suit;
      break;
    }
  }
  if (flushSuit) {
    const suited = cards.filter((c) => suitOf(c) === flushSuit);
    let suitedMask = 0;
    suited.forEach((c) => {
      suitedMask |= 1 << rankOf(c);
    });
    const sfHigh = straightHighFromMask(suitedMask);
    if (sfHigh) {
      return {
        category: 8,
        tiebreak: [sfHigh],
        bestFiveCards: straightCards(suited.slice(), sfHigh, flushSuit),
      };
    }
    const top = suited.sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 5);
    return {
      category: 5,
      tiebreak: top.map(rankOf),
      bestFiveCards: top,
    };
  }

  // Group ranks by multiplicity, highest rank first within each group.
  const quads = [];
  const trips = [];
  const pairs = [];
  const singles = [];
  for (let r = 14; r >= 2; r -= 1) {
    const c = rankCount[r];
    if (c === 4) quads.push(r);
    else if (c === 3) trips.push(r);
    else if (c === 2) pairs.push(r);
    else if (c === 1) singles.push(r);
  }
  // Ranks available as kickers, highest first, excluding a given set.
  const kickers = (exclude, count) => {
    const out = [];
    for (let r = 14; r >= 2 && out.length < count; r -= 1) {
      if (rankCount[r] > 0 && !exclude.includes(r)) {
        out.push(r);
      }
    }
    return out;
  };
  const pool = cards.slice();

  if (quads.length > 0) {
    const quad = quads[0];
    const kicker = kickers([quad], 1)[0];
    return {
      category: 7,
      tiebreak: [quad, kicker],
      bestFiveCards: [...takeRank(pool, quad, 4), ...takeRank(pool, kicker, 1)],
    };
  }

  if (trips.length > 0 && (pairs.length > 0 || trips.length > 1)) {
    const three = trips[0];
    const two = Math.max(pairs[0] || 0, trips[1] || 0);
    return {
      category: 6,
      tiebreak: [three, two],
      bestFiveCards: [...takeRank(pool, three, 3), ...takeRank(pool, two, 2)],
    };
  }

  const straightHigh = straightHighFromMask(rankMask);
  if (straightHigh) {
    return {
      category: 4,
      tiebreak: [straightHigh],
      bestFiveCards: straightCards(pool, straightHigh),
    };
  }

  if (trips.length > 0) {
    const three = trips[0];
    const ks = kickers([three], 2);
    return {
      category: 3,
      tiebreak: [three, ...ks],
      bestFiveCards: [
        ...takeRank(pool, three, 3),
        ...ks.flatMap((k) => takeRank(pool, k, 1)),
      ],
    };
  }

  if (pairs.length >= 2) {
    const high = pairs[0];
    const low = pairs[1];
    const kicker = kickers([high, low], 1)[0];
    return {
      category: 2,
      tiebreak: [high, low, kicker],
      bestFiveCards: [
        ...takeRank(pool, high, 2),
        ...takeRank(pool, low, 2),
        ...takeRank(pool, kicker, 1),
      ],
    };
  }

  if (pairs.length === 1) {
    const pair = pairs[0];
    const ks = kickers([pair], 3);
    return {
      category: 1,
      tiebreak: [pair, ...ks],
      bestFiveCards: [
        ...takeRank(pool, pair, 2),
        ...ks.flatMap((k) => takeRank(pool, k, 1)),
      ],
    };
  }

  const top = singles.slice(0, 5);
  return {
    category: 0,
    tiebreak: top,
    bestFiveCards: top.flatMap((k) => takeRank(pool, k, 1)),
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

function evaluate7(cards) {
  return evaluateBest(cards);
}

// Human-readable name, e.g. "Two Pair, Aces and Kings" or "Straight, Ten high".
function describeEvaluation(evaluation) {
  const { category, tiebreak } = evaluation;
  const name = CATEGORY_NAMES[category];
  const rn = (r) => RANK_NAMES[r];
  const plural = (r) => (r === 6 ? "Sixes" : `${rn(r)}s`);
  switch (category) {
    case 8:
      return tiebreak[0] === 14
        ? "Royal Flush"
        : `${name}, ${rn(tiebreak[0])} high`;
    case 7:
      return `${name}, ${plural(tiebreak[0])}`;
    case 6:
      return `${name}, ${plural(tiebreak[0])} full of ${plural(tiebreak[1])}`;
    case 5:
      return `${name}, ${rn(tiebreak[0])} high`;
    case 4:
      return `${name}, ${rn(tiebreak[0])} high`;
    case 3:
      return `${name}, ${plural(tiebreak[0])}`;
    case 2:
      return `${name}, ${plural(tiebreak[0])} and ${plural(tiebreak[1])}`;
    case 1:
      return `${name}, ${plural(tiebreak[0])}`;
    default:
      return `${name}, ${rn(tiebreak[0])}`;
  }
}

module.exports = {
  evaluate7,
  evaluateBest,
  compareEvaluations,
  describeEvaluation,
  CATEGORY_NAMES,
};
