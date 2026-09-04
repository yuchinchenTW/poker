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

// Large stakes: softmax must not overflow; AI with the nuts facing a bet must not fold
{
  const rng = { random: () => 0.5 };
  const state = {
    config: {
      BB: 10000,
      CHEAT_MODE: false,
      AI_ITERATIONS_PREFLOP: 200,
      AI_ITERATIONS_FLOP: 200,
      AI_ITERATIONS_TURN: 200,
      AI_ITERATIONS_RIVER: 400,
    },
    pot: 600000,
    board: ["Ah", "Kh", "Qh", "Jh", "2d"],
    players: [
      { id: 0, inHand: true, hasFolded: false },
      { id: 1, inHand: true, hasFolded: false },
    ],
    betting: {
      currentStreetMaxBet: 300000,
      minRaise: 300000,
      street: "RIVER",
    },
  };
  const player = {
    id: 1,
    hole: ["Th", "9h"],
    currentBet: 0,
    stack: 1000000,
    inHand: true,
    hasFolded: false,
  };
  const legalActions = [
    { type: "FOLD" },
    { type: "CALL", amount: 300000 },
    { type: "RAISE", minAmount: 600000, maxAmount: 1000000 },
    { type: "ALL_IN" },
  ];
  const result = chooseAction({ state, player, legalActions, opponentModel: null, rng });
  assert.notStrictEqual(result.action.type, "FOLD", "nuts must not fold at high stakes");
  assert.ok(["CALL", "RAISE", "ALL_IN"].includes(result.action.type));
}

// Heads-up: button posts SB and acts first preflop
{
  const { createGameState, playHand } = require("../src/engine/gameState");
  const { DEFAULTS } = require("../src/engine/rules");
  const state = createGameState({ ...DEFAULTS, RNG_SEED: "hu-seed" });
  state.players[2].stack = 0;
  state.players[3].stack = 0;
  state.buttonIndex = 3; // next active seat is 0 -> button will be seat 0
  const order = [];
  playHand(state, async (player) => {
    order.push(player.id);
    return { type: "FOLD" };
  }).then(() => {
    assert.strictEqual(state.buttonIndex, 0);
    const sb = state.handActions.find((a) => a.type === "SB");
    const bb = state.handActions.find((a) => a.type === "BB");
    assert.strictEqual(sb.playerId, 0, "button posts SB heads-up");
    assert.strictEqual(bb.playerId, 1, "other player posts BB heads-up");
    assert.strictEqual(order[0], 0, "button acts first preflop heads-up");
    console.log("ai.test.js passed");
  });
}
