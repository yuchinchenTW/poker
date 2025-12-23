const { estimateEquity } = require("./equityMonteCarlo");
const { getCheatInfo } = require("./cheatVision");
const { evaluateBest } = require("../eval/handEvaluator");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function preflopStrength(hole) {
  const ranks = hole.map((card) => card[0]);
  const suits = hole.map((card) => card[1]);
  const suited = suits[0] === suits[1];
  const values = ranks.map((r) => "23456789TJQKA".indexOf(r) + 2);
  const high = Math.max(...values);
  const low = Math.min(...values);
  if (ranks[0] === ranks[1]) {
    return high >= 11 ? 2 : 1;
  }
  if (high >= 13 && low >= 10) {
    return 2;
  }
  if (suited && high - low === 1 && high >= 9) {
    return 1;
  }
  return 0;
}

function boardThreat(board) {
  if (board.length < 3) {
    return false;
  }
  const ranks = board.map((card) => card[0]);
  const suits = board.map((card) => card[1]);
  const rankCounts = {};
  const suitCounts = {};
  ranks.forEach((r) => {
    rankCounts[r] = (rankCounts[r] || 0) + 1;
  });
  suits.forEach((s) => {
    suitCounts[s] = (suitCounts[s] || 0) + 1;
  });
  const paired = Object.values(rankCounts).some((c) => c >= 2);
  const twoTone = Object.values(suitCounts).some((c) => c >= 2);
  return paired || twoTone;
}

function buildCandidateBets(state, player, legalActions) {
  const candidates = [];
  const potNow = state.pot;
  const toCall = Math.max(0, state.betting.currentStreetMaxBet - player.currentBet);
  const betAction = legalActions.find((a) => a.type === "BET");
  const raiseAction = legalActions.find((a) => a.type === "RAISE");
  const allInAction = legalActions.find((a) => a.type === "ALL_IN");
  const fractions = [0.33, 0.66, 1.0];

  if (betAction) {
    fractions.forEach((f) => {
      const desired = Math.round(Math.max(state.config.BB, potNow * f));
      const target = clamp(desired, betAction.minAmount, betAction.maxAmount);
      candidates.push({ type: "BET", amount: target });
    });
  }

  if (raiseAction) {
    fractions.forEach((f) => {
      const desiredRaise = Math.round(Math.max(state.betting.minRaise, (potNow + toCall) * f));
      const target = clamp(
        state.betting.currentStreetMaxBet + desiredRaise,
        raiseAction.minAmount,
        raiseAction.maxAmount
      );
      candidates.push({ type: "RAISE", amount: target });
    });
  }

  if (allInAction) {
    candidates.push({ type: "ALL_IN" });
  }

  return candidates;
}

function chooseAction({ state, player, legalActions, opponentModel, rng }) {
  const toCall = Math.max(0, state.betting.currentStreetMaxBet - player.currentBet);
  const potNow = state.pot;
  const activeOpponents = state.players.filter(
    (p) => p.inHand && !p.hasFolded && p.id !== player.id
  ).length;
  const cheatInfo = getCheatInfo(state);
  const knownOpponentsHoles =
    cheatInfo && cheatInfo.humanHole && player.id !== 0
      ? [cheatInfo.humanHole]
      : [];

  const iterationsByStreet = {
    PREFLOP: state.config.AI_ITERATIONS_PREFLOP,
    FLOP: state.config.AI_ITERATIONS_FLOP,
    TURN: state.config.AI_ITERATIONS_TURN,
    RIVER: state.config.AI_ITERATIONS_RIVER,
  };
  let iterations = iterationsByStreet[state.betting.street] || 1500;
  if (potNow >= state.config.BB * 20) {
    iterations = Math.round(iterations * 1.5);
  }
  if (potNow > 0 && toCall > 0) {
    const breakeven = toCall / (potNow + toCall);
    if (Math.abs(breakeven - 0.5) < 0.1) {
      iterations = Math.round(iterations * 1.3);
    }
  }

  const equityResult = estimateEquity({
    heroHole: player.hole,
    board: state.board,
    numOpponents: activeOpponents,
    iterations,
    knownOpponentsHoles,
    rng,
  });
  const equity = equityResult.equity;

  const profile = opponentModel ? opponentModel.getProfile() : null;
  let foldEquity = profile ? profile.foldToRaise : 0.35;
  foldEquity = clamp(foldEquity, 0.05, 0.8);
  if (activeOpponents > 1) {
    foldEquity *= Math.max(0.35, 1 - 0.15 * (activeOpponents - 1));
  }

  if (cheatInfo && cheatInfo.humanHole && player.id !== 0) {
    let humanStrength = 0;
    if (state.board.length >= 3) {
      const evalResult = evaluateBest([...cheatInfo.humanHole, ...state.board]);
      humanStrength = evalResult.category;
    } else {
      humanStrength = preflopStrength(cheatInfo.humanHole);
    }
    if (humanStrength <= 1 && boardThreat(state.board)) {
      foldEquity += 0.1;
    }
    if (humanStrength >= 5) {
      foldEquity -= 0.2;
    }
  }
  foldEquity = clamp(foldEquity, 0.05, 0.85);

  const actions = [];
  legalActions.forEach((action) => {
    if (action.type === "FOLD") {
      actions.push({ action: { type: "FOLD" }, ev: 0 });
    }
    if (action.type === "CHECK") {
      actions.push({ action: { type: "CHECK" }, ev: equity * potNow });
    }
    if (action.type === "CALL") {
      const callCost = Math.min(player.stack, toCall);
      const ev = equity * (potNow + callCost) - (1 - equity) * callCost;
      actions.push({ action: { type: "CALL" }, ev });
    }
  });

  const candidates = buildCandidateBets(state, player, legalActions);
  candidates.forEach((candidate) => {
    if (candidate.type === "ALL_IN") {
      const risk = player.stack;
      const potAfterCalled = potNow + risk;
      const ev =
        foldEquity * potNow +
        (1 - foldEquity) * (equity * potAfterCalled - (1 - equity) * risk);
      actions.push({ action: candidate, ev });
      return;
    }
    const target = candidate.amount;
    const risk = target - player.currentBet;
    if (risk <= 0) {
      return;
    }
    const potAfterCalled = potNow + risk + toCall;
    let ev =
      foldEquity * potNow +
      (1 - foldEquity) * (equity * potAfterCalled - (1 - equity) * risk);
    if (equity > 0.52 && equity < 0.65) {
      ev += state.config.BB * 2;
    }
    actions.push({ action: candidate, ev });
  });

  if (actions.length === 0) {
    return { action: { type: "CHECK" }, debug: { equity, foldEquity } };
  }

  actions.sort((a, b) => b.ev - a.ev);

  const temperature = 60;
  const weights = actions.map((entry) => Math.exp(entry.ev / temperature));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng.random() * total;
  let chosen = actions[actions.length - 1];
  for (let i = 0; i < actions.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) {
      chosen = actions[i];
      break;
    }
  }

  return {
    action: chosen.action,
    debug: {
      equity,
      foldEquity,
      evs: actions.map((entry) => ({
        action: entry.action,
        ev: Number(entry.ev.toFixed(2)),
      })),
      iterations,
      cheatUsed: Boolean(cheatInfo),
    },
  };
}

module.exports = {
  chooseAction,
};
