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

// Per-opponent modelling: the registry keeps separate profiles, and a bluff
// is worth less against an opponent who never folds.
{
  const { OpponentModels } = require("../src/ai/opponentModel");
  const models = new OpponentModels();
  // Player 2 folds to a raise every hand, player 3 always calls.
  for (let i = 0; i < 20; i += 1) {
    models.updateFromHand({
      bb: 10,
      playerIds: [1, 2, 3],
      actions: [
        { playerId: 1, type: "RAISE", amount: 30, street: "PREFLOP", forced: false, toCall: 10, maxBetFaced: 10 },
        { playerId: 2, type: "FOLD", amount: 0, street: "PREFLOP", forced: false, toCall: 30, maxBetFaced: 30 },
        { playerId: 3, type: "CALL", amount: 30, street: "PREFLOP", forced: false, toCall: 30, maxBetFaced: 30 },
      ],
      showdown: null,
    });
  }
  const p2 = models.getProfile(2);
  const p3 = models.getProfile(3);
  assert.ok(p2.foldToRaise > 0.7, `player 2 should look fold-happy (${p2.foldToRaise})`);
  assert.ok(p3.foldToRaise < 0.15, `player 3 should look sticky (${p3.foldToRaise})`);
  assert.ok(p3.vpip > p2.vpip, "player 3 is the looser player");

  const mkState = (oppId) => ({
    config: { BB: 10, CHEAT_MODE: false, AI_ITERATIONS_PREFLOP: 200, AI_ITERATIONS_FLOP: 300, AI_ITERATIONS_TURN: 300, AI_ITERATIONS_RIVER: 300 },
    pot: 100,
    board: ["Kd", "7s", "2c", "9h", "4d"],
    players: [
      { id: 0, inHand: true, hasFolded: true },
      { id: 1, inHand: true, hasFolded: false },
      { id: 2, inHand: true, hasFolded: oppId !== 2 },
      { id: 3, inHand: true, hasFolded: oppId !== 3 },
    ],
    betting: { currentStreetMaxBet: 0, minRaise: 10, street: "RIVER" },
    handActions: [],
  });
  const hero = { id: 1, hole: ["6c", "3c"], currentBet: 0, stack: 500, inHand: true, hasFolded: false };
  const legal = [{ type: "CHECK" }, { type: "BET", minAmount: 10, maxAmount: 500 }, { type: "ALL_IN" }];
  const rng = { random: () => 0 };
  const vsFolder = chooseAction({ state: mkState(2), player: hero, legalActions: legal, opponentModels: models, rng });
  const vsStation = chooseAction({ state: mkState(3), player: hero, legalActions: legal, opponentModels: models, rng });
  const bestBetEv = (r) => Math.max(...r.debug.evs.filter((e) => e.action.type !== "CHECK").map((e) => e.ev));
  assert.ok(bestBetEv(vsFolder) > bestBetEv(vsStation), "bluffing is worth more against the folder");
  assert.ok(vsFolder.debug.opponentFoldRates[2] > vsStation.debug.opponentFoldRates[3]);
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
