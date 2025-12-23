const assert = require("node:assert");
const {
  getLegalActions,
  applyAction,
  resetStreet,
} = require("../src/engine/betting");

function makeState() {
  return {
    config: { BB: 10 },
    pot: 0,
    players: [
      { id: 0, name: "H", stack: 100, inHand: true, hasFolded: false, isAllIn: false, currentBet: 0, totalContrib: 0 },
      { id: 1, name: "A1", stack: 100, inHand: true, hasFolded: false, isAllIn: false, currentBet: 0, totalContrib: 0 },
    ],
    betting: {
      currentStreetMaxBet: 10,
      minRaise: 10,
      lastAggressiveSize: 10,
      lastAggressorId: 1,
      street: "PREFLOP",
      actedThisStreet: {},
    },
    handActions: [],
  };
}

// Min-raise availability
{
  const state = makeState();
  state.players[0].currentBet = 0;
  const legal = getLegalActions(state, state.players[0]);
  const raise = legal.find((a) => a.type === "RAISE");
  assert.ok(raise, "raise available");
  assert.strictEqual(raise.minAmount, 20, "min raise to 20");
}

// All-in raise smaller than min raise does not reopen
{
  const state = makeState();
  state.players[0].currentBet = 10;
  state.players[0].stack = 5;
  const result = applyAction(state, 0, { type: "ALL_IN" });
  assert.strictEqual(result.reopen, false, "short all-in should not reopen");
}

// Reset street clears current bets
{
  const state = makeState();
  state.players[0].currentBet = 10;
  state.players[1].currentBet = 10;
  resetStreet(state, "FLOP");
  assert.strictEqual(state.players[0].currentBet, 0);
  assert.strictEqual(state.players[1].currentBet, 0);
  assert.strictEqual(state.betting.currentStreetMaxBet, 0);
}

console.log("betting.test.js passed");
