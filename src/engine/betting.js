function getToCall(state, player) {
  return Math.max(0, state.betting.currentStreetMaxBet - player.currentBet);
}

function contribute(state, player, amount) {
  const actual = Math.min(player.stack, amount);
  player.stack -= actual;
  player.currentBet += actual;
  player.totalContrib += actual;
  state.pot += actual;
  if (player.stack === 0) {
    player.isAllIn = true;
  }
  return actual;
}

function postForcedBet(state, playerId, amount, label) {
  const player = state.players[playerId];
  const posted = contribute(state, player, amount);
  state.handActions.push({
    playerId,
    type: label,
    amount: posted,
    street: "PREFLOP",
    forced: true,
    toCall: null,
  });
  return posted;
}

function getLegalActions(state, player) {
  const toCall = getToCall(state, player);
  const actions = [];
  if (player.hasFolded || player.isAllIn || !player.inHand) {
    return actions;
  }

  if (toCall > 0) {
    actions.push({ type: "FOLD" });
    actions.push({ type: "CALL", amount: Math.min(player.stack, toCall) });
  } else {
    actions.push({ type: "CHECK" });
  }

  // A player facing a short all-in raise after already acting may only
  // fold or call; the betting is not reopened for them (standard rule).
  const locked = Boolean(
    state.betting.lockedThisStreet && state.betting.lockedThisStreet[player.id]
  );
  if (locked) {
    if (player.stack > 0 && player.stack <= toCall) {
      actions.push({ type: "ALL_IN", amount: player.stack });
    }
    return actions;
  }

  if (player.stack > 0) {
    actions.push({ type: "ALL_IN", amount: player.stack });
  }

  const maxRaiseTo = player.currentBet + player.stack;
  if (state.betting.currentStreetMaxBet === 0) {
    const minBetTo = Math.min(maxRaiseTo, state.betting.minRaise);
    if (player.stack > 0) {
      actions.push({ type: "BET", minAmount: minBetTo, maxAmount: maxRaiseTo });
    }
  } else if (player.stack > toCall) {
    const minRaiseTo =
      state.betting.currentStreetMaxBet + state.betting.minRaise;
    if (maxRaiseTo >= minRaiseTo) {
      actions.push({
        type: "RAISE",
        minAmount: minRaiseTo,
        maxAmount: maxRaiseTo,
      });
    }
  }

  return actions;
}

function applyAction(state, playerId, action) {
  const player = state.players[playerId];
  const toCall = getToCall(state, player);
  const oldMax = state.betting.currentStreetMaxBet;
  let reopen = false;
  let actionType = action.type;
  let amount = 0;
  let betTo = player.currentBet;

  switch (action.type) {
    case "FOLD":
      player.hasFolded = true;
      break;
    case "CHECK":
      break;
    case "CALL":
      amount = contribute(state, player, toCall);
      if (amount < toCall) {
        player.isAllIn = true;
      }
      betTo = player.currentBet;
      break;
    case "BET": {
      const target = Math.min(action.amount, player.currentBet + player.stack);
      amount = contribute(state, player, target - player.currentBet);
      state.betting.currentStreetMaxBet = target;
      state.betting.lastAggressiveSize = target - oldMax;
      state.betting.minRaise = state.betting.lastAggressiveSize;
      state.betting.lastAggressorId = playerId;
      reopen = true;
      betTo = target;
      break;
    }
    case "RAISE": {
      const target = Math.min(action.amount, player.currentBet + player.stack);
      amount = contribute(state, player, target - player.currentBet);
      const raiseSize = target - oldMax;
      state.betting.currentStreetMaxBet = target;
      state.betting.lastAggressiveSize = raiseSize;
      state.betting.lastAggressorId = playerId;
      if (raiseSize >= state.betting.minRaise) {
        state.betting.minRaise = raiseSize;
        reopen = true;
      } else {
        reopen = false;
      }
      betTo = target;
      break;
    }
    case "ALL_IN": {
      const target = player.currentBet + player.stack;
      if (target <= player.currentBet) {
        break;
      }
      if (toCall > 0 && target <= oldMax) {
        actionType = "CALL";
        amount = contribute(state, player, toCall);
        break;
      }
      amount = contribute(state, player, target - player.currentBet);
      const raiseSize = target - oldMax;
      state.betting.currentStreetMaxBet = Math.max(oldMax, target);
      state.betting.lastAggressiveSize = Math.max(raiseSize, 0);
      state.betting.lastAggressorId = playerId;
      if (oldMax === 0 || raiseSize >= state.betting.minRaise) {
        state.betting.minRaise = Math.max(raiseSize, state.betting.minRaise);
        reopen = true;
      } else {
        reopen = false;
      }
      betTo = target;
      break;
    }
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }

  state.handActions.push({
    playerId,
    type: actionType,
    amount,
    street: state.betting.street,
    forced: false,
    toCall,
    maxBetFaced: oldMax,
  });

  return { reopen, toCall, amount, actionType, betTo };
}

function bettingRoundComplete(state) {
  const activeNotFolded = state.players.filter(
    (p) => p.inHand && !p.hasFolded
  );
  if (activeNotFolded.length <= 1) {
    return true;
  }
  const eligible = state.players.filter(
    (p) => p.inHand && !p.hasFolded && !p.isAllIn
  );
  if (eligible.length === 0) {
    return true;
  }
  return eligible.every(
    (p) =>
      state.betting.actedThisStreet[p.id] &&
      (p.currentBet === state.betting.currentStreetMaxBet || p.isAllIn)
  );
}

function nextEligibleSeat(state, fromSeat) {
  const total = state.players.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const idx = (fromSeat + offset) % total;
    const p = state.players[idx];
    if (p.inHand && !p.hasFolded && !p.isAllIn) {
      return idx;
    }
  }
  return -1;
}

async function runBettingRound(state, startingSeat, getAction) {
  state.betting.actedThisStreet = {};
  state.betting.lockedThisStreet = {};
  state.players.forEach((p) => {
    if (p.inHand && !p.hasFolded && !p.isAllIn) {
      state.betting.actedThisStreet[p.id] = false;
    }
  });

  let seat = startingSeat;
  let safety = 0;
  while (!bettingRoundComplete(state)) {
    safety += 1;
    if (safety > 500) {
      throw new Error("Betting round exceeded safety limit.");
    }
    const player = state.players[seat];
    if (player && player.inHand && !player.hasFolded && !player.isAllIn) {
      const legalActions = getLegalActions(state, player);
      const action = await getAction(player, state, legalActions);
      const result = applyAction(state, player.id, action);
      if (state.onAction) {
        state.onAction({
          player,
          actionType: result.actionType,
          amount: result.amount,
          betTo: result.betTo,
          toCall: result.toCall,
        });
      }
      state.betting.actedThisStreet[player.id] = true;
      if (
        result.reopen === false &&
        ["RAISE", "ALL_IN", "BET"].includes(result.actionType)
      ) {
        Object.keys(state.betting.actedThisStreet).forEach((id) => {
          const pid = Number(id);
          if (pid !== player.id && state.betting.actedThisStreet[pid]) {
            state.betting.lockedThisStreet[pid] = true;
          }
        });
      }
      if (result.reopen) {
        state.betting.lockedThisStreet = {};
        state.players.forEach((p) => {
          if (p.inHand && !p.hasFolded && !p.isAllIn && p.id !== player.id) {
            state.betting.actedThisStreet[p.id] = false;
          }
        });
      }
    }

    if (bettingRoundComplete(state)) {
      break;
    }
    const nextSeat = nextEligibleSeat(state, seat);
    if (nextSeat === -1) {
      break;
    }
    seat = nextSeat;
  }
}

function resetStreet(state, street) {
  state.players.forEach((p) => {
    if (p.inHand && !p.hasFolded) {
      p.currentBet = 0;
    }
  });
  state.betting.currentStreetMaxBet = 0;
  state.betting.lastAggressiveSize = state.config.BB;
  state.betting.minRaise = state.config.BB;
  state.betting.lastAggressorId = null;
  state.betting.street = street;
  state.betting.actedThisStreet = {};
  state.betting.lockedThisStreet = {};
}

module.exports = {
  getToCall,
  getLegalActions,
  applyAction,
  runBettingRound,
  resetStreet,
  postForcedBet,
};
