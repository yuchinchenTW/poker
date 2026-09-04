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

  // De-duplicate: several pot fractions can clamp to the same amount, and a
  // raise/bet for the whole stack is the same action as ALL_IN. Without this
  // the softmax would give identical actions several times the weight.
  const allInTo = player.currentBet + player.stack;
  const seen = new Set();
  return candidates.filter((c) => {
    if (c.type !== "ALL_IN" && c.amount >= allInTo) {
      if (!allInAction) {
        c.type = "ALL_IN";
        delete c.amount;
      } else {
        return false;
      }
    }
    const key = c.type === "ALL_IN" ? "ALL_IN" : `${c.type}:${c.amount}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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
  const rawEquity = equityResult.equity;

  // Monte Carlo equity is against random hands. Opponents who bet or raised
  // hold stronger-than-random ranges, so discount the equity once per
  // aggressive action still standing (players who folded no longer matter).
  // Aggression on the current street counts fully, earlier streets at half
  // weight so a flop raise is not forgotten on the turn. Facing a bet costs
  // 25% of raw equity, a bet + raise ~44%.
  // A voluntary preflop call also signals a better-than-random hand, so it
  // counts as a quarter of a raise.
  const rangeSignals = Array.isArray(state.handActions)
    ? state.handActions.filter(
        (a) =>
          !a.forced &&
          a.playerId !== player.id &&
          (["BET", "RAISE", "ALL_IN"].includes(a.type) ||
            (a.type === "CALL" && a.street === "PREFLOP")) &&
          state.players[a.playerId] &&
          !state.players[a.playerId].hasFolded
      )
    : [];
  const aggressionFaced = rangeSignals.reduce((sum, a) => {
    const weight = a.type === "CALL" ? 0.25 : 1;
    return sum + (a.street === state.betting.street ? weight : weight * 0.5);
  }, 0);
  const equity = clamp(rawEquity * Math.pow(0.75, aggressionFaced), 0, 1);

  const profile = opponentModel ? opponentModel.getProfile() : null;
  let foldEquity = profile ? profile.foldToRaise : 0.35;
  foldEquity = clamp(foldEquity, 0.05, 0.8);

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

  // Model of what happens after we bet/raise `risk` more chips:
  // - Opponents fold more often to bigger bets. Use the minimum-defence
  //   frequency alpha = bet / (pot + bet) as a floor for the modelled
  //   fold-to-raise rate, so a 10x-pot shove is rarely called.
  // - To win uncontested, every remaining opponent has to fold.
  // - The hands that do call a big bet are strong, so equity-when-called is
  //   discounted in proportion to how narrow the calling range is. The
  //   discount is eq*(1-eq)-shaped: zero for the nuts and for no-hopers.
  // - An opponent who has already bet or raised is committed and folds far
  //   less often: the modelled fold rate is halved per aggressive action and
  //   the size-based floor is reduced by 40% per aggressive action (a huge
  //   shove still gets some folds even from a raiser).
  // - A bet/raise can be re-raised. Weak hands then have to give up and lose
  //   what they put in; the chance of that grows the weaker the hand is.
  // - Deep-stack risk penalty: chips risked beyond the current pot are
  //   taxed, so huge overbets are only chosen when clearly best.
  const OVERBET_PENALTY = 0.1;
  const betOutcome = (risk) => {
    const alpha = risk / Math.max(1, potNow + risk);
    const foldOne = clamp(
      Math.max(
        foldEquity * Math.pow(0.5, aggressionFaced),
        alpha * Math.pow(0.6, aggressionFaced)
      ),
      0.02,
      0.95
    );
    const foldAll = Math.pow(foldOne, Math.max(1, activeOpponents));
    const rangeNarrowness = foldOne;
    const eqCalled = clamp(
      equity - 1.5 * rangeNarrowness * equity * (1 - equity),
      0,
      1
    );
    const reraiseGiveUp = 0.25 * (1 - eqCalled);
    const penalty = OVERBET_PENALTY * Math.max(0, risk - potNow);
    return { foldAll, eqCalled, reraiseGiveUp, penalty };
  };
  const aggressiveEv = (risk, potAfterCalled) => {
    const { foldAll, eqCalled, reraiseGiveUp, penalty } = betOutcome(risk);
    const whenCalled = eqCalled * potAfterCalled - (1 - eqCalled) * risk;
    const whenContested =
      (1 - reraiseGiveUp) * whenCalled + reraiseGiveUp * -risk;
    return foldAll * potNow + (1 - foldAll) * whenContested - penalty;
  };

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
      const potAfterCalled = potNow + risk + toCall;
      const ev = aggressiveEv(risk, potAfterCalled);
      actions.push({ action: candidate, ev });
      return;
    }
    const target = candidate.amount;
    const risk = target - player.currentBet;
    if (risk <= 0) {
      return;
    }
    const potAfterCalled = potNow + risk + toCall;
    let ev = aggressiveEv(risk, potAfterCalled);
    if (equity > 0.52 && equity < 0.65) {
      ev += state.config.BB * 2;
    }
    actions.push({ action: candidate, ev });
  });

  if (actions.length === 0) {
    return { action: { type: "CHECK" }, debug: { equity, foldEquity } };
  }

  actions.sort((a, b) => b.ev - a.ev);

  // Mixing temperature scales with the pot (2% of it, floor 0.25 BB) so the
  // softmax behaves the same at any stake and on any street: preflop EV
  // differences are only a few big blinds, so a large fixed temperature
  // would make hand selection random, while postflop pots are big enough
  // that near-ties still get mixed. EVs are shifted by the best EV before
  // exponentiating so large stakes cannot overflow to Infinity (which would
  // otherwise make the selection loop pick the worst action).
  const bb = state.config.BB || 10;
  const temperature = Math.max(1, bb * 0.25, potNow * 0.02);
  const bestEv = actions[0].ev;
  const weights = actions.map((entry) =>
    Math.exp((entry.ev - bestEv) / temperature)
  );
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
      rawEquity,
      aggressionFaced,
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
