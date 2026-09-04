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

// Player locked by a short all-in may still call (or fold) but not raise
{
  const state = makeState();
  state.betting.currentStreetMaxBet = 15;
  state.betting.lockedThisStreet = { 0: true };
  state.players[0].currentBet = 10;
  const legal = getLegalActions(state, state.players[0]);
  const types = legal.map((a) => a.type).sort();
  assert.deepStrictEqual(types, ["CALL", "FOLD"], "locked player: fold/call only");
}

// Full raise after a short all-in clears the lock (round-level behaviour)
{
  const { runBettingRound } = require("../src/engine/betting");
  const state = makeState();
  state.players.push({ id: 2, name: "A2", stack: 100, inHand: true, hasFolded: false, isAllIn: false, currentBet: 0, totalContrib: 0 });
  state.betting.currentStreetMaxBet = 0;
  state.betting.street = "FLOP";
  state.players[1].stack = 15; // will short all-in over a 10 bet
  const script = {
    0: [{ type: "BET", amount: 10 }, { type: "CALL" }],
    1: [{ type: "ALL_IN" }],
    2: [{ type: "CALL" }],
  };
  const seen = [];
  runBettingRound(state, 0, async (player, st, legal) => {
    const next = script[player.id].shift();
    seen.push(`${player.id}:${next.type}:${legal.map((a) => a.type).join("/")}`);
    return next;
  }).then(() => {
    // P2 had not acted yet so it keeps full options; P0 already acted and
    // must be offered a second action (call the extra 5) without a raise.
    assert.strictEqual(seen.length, 4, `expected 4 actions, saw ${seen.join(" | ")}`);
    assert.ok(seen[2].includes("RAISE"), "P2 not locked (had not acted)");
    assert.strictEqual(seen[3], "0:CALL:FOLD/CALL", "P0 locked to fold/call");
    assert.strictEqual(state.players[0].currentBet, 15);
    assert.strictEqual(state.players[2].currentBet, 15);
    console.log("betting.test.js passed");
  });
}
