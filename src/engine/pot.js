const { evaluate7, compareEvaluations } = require("../eval/handEvaluator");

function buildSidePots(players) {
  const contributors = players.filter((p) => p.totalContrib > 0);
  const levels = Array.from(
    new Set(contributors.map((p) => p.totalContrib))
  ).sort((a, b) => a - b);

  const pots = [];
  let prevLevel = 0;

  for (const level of levels) {
    const involved = contributors.filter((p) => p.totalContrib >= level);
    const sliceAmount = (level - prevLevel) * involved.length;
    const eligible = involved.filter((p) => !p.hasFolded).map((p) => p.id);
    if (sliceAmount > 0) {
      pots.push({
        amount: sliceAmount,
        eligiblePlayerIds: eligible,
      });
    }
    prevLevel = level;
  }

  return pots;
}

function seatOrderFromButton(players, buttonIndex) {
  const order = [];
  for (let offset = 1; offset <= players.length; offset += 1) {
    const idx = (buttonIndex + offset) % players.length;
    order.push(idx);
  }
  return order;
}

function resolvePots(pots, players, board, buttonIndex) {
  const payouts = {};
  const potResults = [];
  for (const pot of pots) {
    if (pot.eligiblePlayerIds.length === 0) {
      potResults.push({ pot, winners: [] });
      continue;
    }
    if (pot.eligiblePlayerIds.length === 1) {
      const winnerId = pot.eligiblePlayerIds[0];
      payouts[winnerId] = (payouts[winnerId] || 0) + pot.amount;
      potResults.push({ pot, winners: [winnerId] });
      continue;
    }
    let bestEval = null;
    let winners = [];
    for (const playerId of pot.eligiblePlayerIds) {
      const player = players[playerId];
      const evalResult = evaluate7([...player.hole, ...board]);
      if (!bestEval || compareEvaluations(evalResult, bestEval) > 0) {
        bestEval = evalResult;
        winners = [playerId];
      } else if (compareEvaluations(evalResult, bestEval) === 0) {
        winners.push(playerId);
      }
    }

    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount % winners.length;
    winners.forEach((winnerId) => {
      payouts[winnerId] = (payouts[winnerId] || 0) + share;
    });

    if (remainder > 0) {
      const order = seatOrderFromButton(players, buttonIndex).filter((id) =>
        winners.includes(id)
      );
      let idx = 0;
      while (remainder > 0) {
        const winnerId = order[idx % order.length];
        payouts[winnerId] += 1;
        remainder -= 1;
        idx += 1;
      }
    }

    potResults.push({ pot, winners });
  }
  return { payouts, potResults };
}

module.exports = {
  buildSidePots,
  resolvePots,
};
