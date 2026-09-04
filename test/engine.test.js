const assert = require("node:assert");
const { createGameState, playHand } = require("../src/engine/gameState");
const { DEFAULTS } = require("../src/engine/rules");
const { createRng } = require("../src/utils/rng");

// Randomised full-hand engine test: random legal actions across several
// stack depths and ante settings. Checks chip conservation, side-pot
// bookkeeping, payouts and termination. Deterministic via seeded RNG.
const scenarios = [
  { name: "deep", STARTING_STACK: 1000, SB: 5, BB: 10, ANTE: 0 },
  { name: "short", STARTING_STACK: 35, SB: 5, BB: 10, ANTE: 0 },
  { name: "ante", STARTING_STACK: 200, SB: 5, BB: 10, ANTE: 2 },
  { name: "tiny-ante", STARTING_STACK: 12, SB: 5, BB: 10, ANTE: 3 },
  { name: "odd", STARTING_STACK: 333, SB: 3, BB: 7, ANTE: 1 },
];

async function runScenario(sc, run) {
  const seed = `${sc.name}-${run}`;
  const state = createGameState({ ...DEFAULTS, ...sc, RNG_SEED: seed });
  const r = createRng(`${seed}-actions`);
  state.players.forEach((p) => {
    p.stack = Math.max(1, Math.round(sc.STARTING_STACK * (0.2 + 1.6 * r.random())));
  });
  const total = state.players.reduce((s, p) => s + p.stack, 0);
  let hands = 0;
  while (hands < 150 && state.players.filter((p) => p.stack > 0).length >= 2) {
    const summary = await playHand(state, async (player, st, legal) => {
      assert.ok(legal.length > 0, `${seed}: no legal actions for ${player.name}`);
      const a = legal[Math.floor(r.random() * legal.length)];
      if (a.type === "BET" || a.type === "RAISE") {
        assert.ok(a.minAmount <= a.maxAmount, `${seed}: ${a.type} min > max`);
        const amt = a.minAmount + Math.floor(r.random() * (a.maxAmount - a.minAmount + 1));
        return { type: a.type, amount: amt };
      }
      return { type: a.type };
    });
    if (!summary) break;
    hands += 1;
    const now = state.players.reduce((s, p) => s + p.stack, 0);
    assert.strictEqual(now, total, `${seed} hand ${hands}: chips not conserved`);
    assert.strictEqual(state.pot, 0, `${seed} hand ${hands}: pot not cleared`);
    state.players.forEach((p) => assert.ok(p.stack >= 0, `${seed}: negative stack`));
    const potSum = summary.showdown.pots.reduce((s, p) => s + p.amount, 0);
    const contrib = summary.actions.reduce((s, a) => s + (a.amount || 0), 0);
    assert.strictEqual(potSum, contrib, `${seed} hand ${hands}: pots != contributions`);
    const paid = Object.values(summary.showdown.payouts).reduce((s, v) => s + v, 0);
    assert.strictEqual(paid, potSum, `${seed} hand ${hands}: payouts != pots`);
    summary.showdown.potResults.forEach((pr) =>
      pr.winners.forEach((w) =>
        assert.ok(pr.pot.eligiblePlayerIds.includes(w), `${seed}: ineligible winner`)
      )
    );
    const active = state.players.filter((p) => p.inHand && !p.hasFolded);
    if (active.length > 1) {
      assert.strictEqual(summary.board.length, 5, `${seed}: showdown without full board`);
    }
  }
  assert.ok(hands > 0, `${seed}: no hands played`);
}

(async () => {
  for (const sc of scenarios) {
    for (let run = 0; run < 8; run += 1) {
      await runScenario(sc, run);
    }
  }
  console.log("engine.test.js passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
