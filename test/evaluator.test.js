const assert = require("node:assert");
const { evaluate7, compareEvaluations } = require("../src/eval/handEvaluator");

const cases = [
  { name: "sf-royal", cards: ["Ah", "Kh", "Qh", "Jh", "Th", "2d", "3c"], category: 8, high: 14 },
  { name: "sf-wheel", cards: ["Ah", "2h", "3h", "4h", "5h", "9c", "Kd"], category: 8, high: 5 },
  { name: "quads-aces", cards: ["As", "Ad", "Ac", "Ah", "9d", "2c", "3h"], category: 7 },
  { name: "quads-9s", cards: ["9s", "9d", "9c", "9h", "Kd", "2c", "3h"], category: 7 },
  { name: "full-house-k2", cards: ["Ks", "Kd", "Kh", "2c", "2d", "9s", "8h"], category: 6 },
  { name: "full-house-board", cards: ["Ks", "Kd", "Kh", "7s", "7d", "2c", "3h"], category: 6 },
  { name: "flush-ace-high", cards: ["Ah", "8h", "5h", "2h", "Kh", "3c", "9d"], category: 5 },
  { name: "flush-board-plus-hole", cards: ["2h", "5h", "9h", "Jh", "Qh", "4c", "7d"], category: 5 },
  { name: "straight-9-high", cards: ["9s", "8d", "7h", "6c", "5d", "2s", "Ah"], category: 4, high: 9 },
  { name: "straight-wheel", cards: ["Ah", "2d", "3s", "4c", "5h", "9d", "Kc"], category: 4, high: 5 },
  { name: "trips-queens", cards: ["Qs", "Qd", "Qh", "9s", "2d", "3c", "4h"], category: 3 },
  { name: "trips-board", cards: ["7s", "7d", "7c", "2h", "9d", "3s", "4c"], category: 3 },
  { name: "two-pair-ak", cards: ["Ah", "Ad", "Ks", "Kd", "2c", "3d", "4h"], category: 2 },
  { name: "two-pair-board", cards: ["As", "Kd", "2h", "2d", "9c", "9s", "3h"], category: 2 },
  { name: "two-pair-hole-board", cards: ["5s", "5d", "Kc", "Kd", "2h", "3s", "9c"], category: 2 },
  { name: "pair-aces", cards: ["Ah", "Ad", "9s", "7c", "4h", "3d", "2s"], category: 1 },
  { name: "pair-board", cards: ["Ah", "Kd", "9s", "9c", "4h", "3d", "2s"], category: 1 },
  { name: "pair-threes", cards: ["3h", "3d", "9s", "7c", "4h", "5d", "2s"], category: 1 },
  { name: "high-card-ace", cards: ["Ah", "Kd", "9s", "7c", "4h", "3d", "2s"], category: 0 },
  { name: "high-card-broadway", cards: ["Ah", "Kh", "Qd", "Jc", "9s", "4d", "2c"], category: 0 },
  { name: "straight-with-dup", cards: ["9s", "8d", "7h", "6c", "5d", "5s", "Ah"], category: 4 },
  { name: "full-house-8s", cards: ["8s", "8d", "8c", "2h", "2d", "9s", "Ah"], category: 6 },
  { name: "quads-board", cards: ["6s", "6d", "6c", "6h", "2d", "9s", "Ah"], category: 7 },
  { name: "flush-low", cards: ["2s", "4s", "6s", "8s", "Ts", "Ah", "Kd"], category: 5 },
  { name: "sf-king-high", cards: ["9h", "Th", "Jh", "Qh", "Kh", "2d", "3c"], category: 8, high: 13 },
  { name: "trips-jacks", cards: ["Js", "Jd", "Jh", "9s", "8d", "3c", "2h"], category: 3 },
  { name: "two-pair-99-44", cards: ["4s", "4d", "9c", "9d", "Ah", "2c", "3h"], category: 2 },
  { name: "pair-queens", cards: ["Qs", "Qd", "Ah", "Kd", "9s", "4h", "2c"], category: 1 },
  { name: "full-house-2s", cards: ["2s", "2d", "2c", "Ah", "Ad", "9s", "8h"], category: 6 },
  { name: "high-card-mid", cards: ["Kd", "Jc", "9s", "7h", "5d", "3c", "2h"], category: 0 },
];

cases.forEach((testCase) => {
  const result = evaluate7(testCase.cards);
  assert.strictEqual(result.category, testCase.category, testCase.name);
  if (testCase.high) {
    assert.strictEqual(result.tiebreak[0], testCase.high, testCase.name);
  }
  assert.strictEqual(result.bestFiveCards.length, 5, `${testCase.name} bestFiveCards`);
});

const boardTie = ["Ks", "Kd", "Kh", "7s", "7d"];
const hand1 = evaluate7([...boardTie, "2c", "3h"]);
const hand2 = evaluate7([...boardTie, "4c", "5h"]);
assert.strictEqual(compareEvaluations(hand1, hand2), 0, "board full house tie");

console.log("evaluator.test.js passed");
