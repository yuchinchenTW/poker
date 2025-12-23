const assert = require("node:assert");
const { buildSidePots, resolvePots } = require("../src/engine/pot");

function makePlayer(id, contrib, hole, folded = false) {
  return {
    id,
    name: `P${id}`,
    totalContrib: contrib,
    hasFolded: folded,
    hole,
  };
}

// Single all-in heads-up
{
  const players = [
    makePlayer(0, 50, ["As", "Ad"]),
    makePlayer(1, 50, ["Ks", "Kd"]),
  ];
  const board = ["7h", "8d", "9c", "2h", "4d"];
  const pots = buildSidePots(players);
  assert.strictEqual(pots.length, 1);
  const result = resolvePots(pots, players, board, 0);
  assert.strictEqual(result.payouts[0], 100);
}

// Two all-ins with different stacks
{
  const players = [
    makePlayer(0, 30, ["As", "Ad"]),
    makePlayer(1, 60, ["Ks", "Kd"]),
    makePlayer(2, 100, ["Qs", "Qd"]),
  ];
  const board = ["7h", "8d", "9c", "2h", "4d"];
  const pots = buildSidePots(players);
  assert.deepStrictEqual(
    pots.map((p) => p.amount),
    [90, 60, 40]
  );
  const result = resolvePots(pots, players, board, 0);
  assert.ok(result.payouts[0] > 0);
}

// Three-way all-in with a folding contributor
{
  const players = [
    makePlayer(0, 40, ["As", "Ad"]),
    makePlayer(1, 40, ["Ks", "Kd"]),
    makePlayer(2, 100, ["Qs", "Qd"]),
    makePlayer(3, 40, ["2s", "3s"], true),
  ];
  const pots = buildSidePots(players);
  const totalPot = pots.reduce((sum, p) => sum + p.amount, 0);
  assert.strictEqual(totalPot, 220);
  pots.forEach((pot) => {
    assert.ok(!pot.eligiblePlayerIds.includes(3));
  });
}

// Odd chip distribution
{
  const players = [
    makePlayer(0, 3, ["As", "Ad"]),
    makePlayer(1, 3, ["Ks", "Kd"]),
    makePlayer(2, 3, ["Ac", "Ah"]),
  ];
  const board = ["2h", "3d", "4s", "9c", "Qh"]; // 0 and 2 tie with aces
  const pots = buildSidePots(players);
  const result = resolvePots(pots, players, board, 0);
  assert.strictEqual(result.payouts[1] || 0, 0);
  assert.strictEqual(result.payouts[0] + result.payouts[2], 9);
  assert.strictEqual(result.payouts[2], 5);
}

console.log("pot.test.js passed");
