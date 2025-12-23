const assert = require("node:assert");
const { estimateEquity } = require("../src/ai/equityMonteCarlo");
const { chooseAction } = require("../src/ai/strategy");
const { createRng } = require("../src/utils/rng");

// Monte Carlo equity sanity with fixed seed
{
  const rng = createRng("seed-1");
  const result = estimateEquity({
    heroHole: ["As", "Ad"],
    board: [],
    numOpponents: 1,
    iterations: 1500,
    rng,
  });
  assert.ok(result.equity > 0.75 && result.equity < 0.9);
}

// AI has nuts on river -> should choose value bet/raise often
{
  const rng = { random: () => 0 };
  const state = {
    config: {
      BB: 10,
      CHEAT_MODE: false,
      AI_ITERATIONS_PREFLOP: 200,
      AI_ITERATIONS_FLOP: 200,
      AI_ITERATIONS_TURN: 200,
      AI_ITERATIONS_RIVER: 400,
    },
    pot: 120,
    board: ["Ah", "Kh", "Qh", "Jh", "2d"],
    players: [
      { id: 0, inHand: true, hasFolded: false },
      { id: 1, inHand: true, hasFolded: false },
    ],
    betting: {
      currentStreetMaxBet: 0,
      minRaise: 10,
      street: "RIVER",
    },
  };
  const player = {
    id: 1,
    hole: ["Th", "9h"],
    currentBet: 0,
    stack: 200,
    inHand: true,
    hasFolded: false,
  };
  const legalActions = [
    { type: "CHECK" },
    { type: "BET", minAmount: 10, maxAmount: 200 },
    { type: "ALL_IN" },
  ];
  const result = chooseAction({ state, player, legalActions, opponentModel: null, rng });
  assert.ok(["BET", "ALL_IN"].includes(result.action.type));
}

// Cheat reveals human nuts -> AI should fold marginal hand facing a bet
{
  const rng = { random: () => 0 };
  const state = {
    config: {
      BB: 10,
      CHEAT_MODE: true,
      AI_ITERATIONS_PREFLOP: 200,
      AI_ITERATIONS_FLOP: 200,
      AI_ITERATIONS_TURN: 200,
      AI_ITERATIONS_RIVER: 400,
    },
    pot: 200,
    board: ["Ah", "Kh", "Qh", "Jh", "2d"],
    players: [
      { id: 0, inHand: true, hasFolded: false, hole: ["Th", "9h"] },
      { id: 1, inHand: true, hasFolded: false },
    ],
    betting: {
      currentStreetMaxBet: 50,
      minRaise: 10,
      street: "RIVER",
    },
  };
  const player = {
    id: 1,
    hole: ["7c", "2c"],
    currentBet: 0,
    stack: 100,
    inHand: true,
    hasFolded: false,
  };
  const legalActions = [
    { type: "FOLD" },
    { type: "CALL", amount: 50 },
  ];
  const result = chooseAction({ state, player, legalActions, opponentModel: null, rng });
  assert.strictEqual(result.action.type, "FOLD");
}

console.log("ai.test.js passed");
