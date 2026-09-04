const { createRng } = require("../utils/rng");
const {
  createDeck,
  shuffleDeck,
  dealHoleCards,
  dealFlop,
  dealTurn,
  dealRiver,
} = require("./dealer");
const {
  resetStreet,
  runBettingRound,
  postForcedBet,
} = require("./betting");
const { buildSidePots, resolvePots } = require("./pot");
const { evaluate7 } = require("../eval/handEvaluator");
const { formatCards } = require("../utils/format");
const { loadConfig } = require("./rules");

function createPlayers(config) {
  const startingStack = config.STARTING_STACK;
  return [
    {
      id: 0,
      name: "H",
      isHuman: true,
      stack: startingStack,
      inHand: true,
      hasFolded: false,
      isAllIn: false,
      currentBet: 0,
      totalContrib: 0,
      hole: [],
    },
    {
      id: 1,
      name: "A1",
      isHuman: false,
      stack: startingStack,
      inHand: true,
      hasFolded: false,
      isAllIn: false,
      currentBet: 0,
      totalContrib: 0,
      hole: [],
    },
    {
      id: 2,
      name: "A2",
      isHuman: false,
      stack: startingStack,
      inHand: true,
      hasFolded: false,
      isAllIn: false,
      currentBet: 0,
      totalContrib: 0,
      hole: [],
    },
    {
      id: 3,
      name: "A3",
      isHuman: false,
      stack: startingStack,
      inHand: true,
      hasFolded: false,
      isAllIn: false,
      currentBet: 0,
      totalContrib: 0,
      hole: [],
    },
  ];
}

function nextActiveSeat(state, fromSeat) {
  const total = state.players.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const idx = (fromSeat + offset) % total;
    const player = state.players[idx];
    if (player.inHand && player.stack > 0) {
      return idx;
    }
  }
  return -1;
}

function countActiveNotFolded(state) {
  return state.players.filter((p) => p.inHand && !p.hasFolded).length;
}

function canAnyoneAct(state) {
  const ableToAct = state.players.filter(
    (p) => p.inHand && !p.hasFolded && !p.isAllIn
  );
  return ableToAct.length >= 2;
}

function logLine(state, line) {
  state.actionLog.push(line);
  if (state.onLog) {
    state.onLog(line);
  }
}

function logAction(state, info) {
  const { player, actionType, amount, betTo } = info;
  let line = "";
  switch (actionType) {
    case "FOLD":
      line = `${player.name} folds`;
      break;
    case "CHECK":
      line = `${player.name} checks`;
      break;
    case "CALL":
      line = `${player.name} calls ${amount}`;
      break;
    case "BET":
      line = `${player.name} bets ${betTo}`;
      break;
    case "RAISE":
      line = `${player.name} raises to ${betTo}`;
      break;
    case "ALL_IN":
      line = `${player.name} goes all-in ${betTo}`;
      break;
    default:
      line = `${player.name} ${actionType}`;
  }
  logLine(state, line);
}

function postAnte(state, playerId, amount) {
  const player = state.players[playerId];
  const posted = Math.min(player.stack, amount);
  player.stack -= posted;
  player.totalContrib += posted;
  state.pot += posted;
  if (player.stack === 0) {
    player.isAllIn = true;
  }
  state.handActions.push({
    playerId,
    type: "ANTE",
    amount: posted,
    street: "PREFLOP",
    forced: true,
    toCall: null,
  });
  if (posted > 0) {
    logLine(state, `${player.name} posts ante ${posted}`);
  }
}

function initHand(state) {
  state.handNumber += 1;
  state.board = [];
  state.pot = 0;
  state.actionLog = [];
  state.handActions = [];
  state.showdown = null;
  state.equityAtFold = {};

  state.players.forEach((p) => {
    p.inHand = p.stack > 0;
    p.hasFolded = false;
    p.isAllIn = false;
    p.currentBet = 0;
    p.totalContrib = 0;
    p.hole = [];
  });

  state.buttonIndex = nextActiveSeat(state, state.buttonIndex);
}

function setupBettingState(state) {
  state.betting = {
    currentStreetMaxBet: 0,
    lastAggressiveSize: state.config.BB,
    minRaise: state.config.BB,
    lastAggressorId: null,
    street: "PREFLOP",
    actedThisStreet: {},
  };
}

function dealRemainingBoard(state, deck) {
  if (state.board.length === 0) {
    dealFlop(deck, state.board);
  }
  if (state.board.length === 3) {
    dealTurn(deck, state.board);
  }
  if (state.board.length === 4) {
    dealRiver(deck, state.board);
  }
}

async function playHand(state, getAction, onLog, onAction) {
  state.onLog = onLog;
  state.onAction = (info) => {
    logAction(state, info);
    if (onAction) {
      onAction(info, state);
    }
  };
  initHand(state);
  setupBettingState(state);

  if (countActiveNotFolded(state) < 2) {
    return null;
  }

  const deck = shuffleDeck(createDeck(), state.rng);

  if (state.config.ANTE > 0) {
    state.players.forEach((p) => {
      if (p.inHand) {
        postAnte(state, p.id, state.config.ANTE);
      }
    });
  }

  // Heads-up: the button posts the small blind and acts first preflop.
  const seatsWithChips = state.players.filter((p) => p.inHand && p.stack > 0)
    .length;
  const sbSeat =
    seatsWithChips === 2
      ? state.buttonIndex
      : nextActiveSeat(state, state.buttonIndex);
  const bbSeat = nextActiveSeat(state, sbSeat);
  if (sbSeat === -1 || bbSeat === -1) {
    return null;
  }

  const sbAmount = postForcedBet(state, sbSeat, state.config.SB, "SB");
  const bbAmount = postForcedBet(state, bbSeat, state.config.BB, "BB");
  state.betting.currentStreetMaxBet = Math.max(sbAmount, bbAmount);
  state.betting.lastAggressiveSize = state.config.BB;
  state.betting.minRaise = state.config.BB;
  state.betting.lastAggressorId = bbSeat;
  logLine(state, `${state.players[sbSeat].name} posts SB ${sbAmount}`);
  logLine(state, `${state.players[bbSeat].name} posts BB ${bbAmount}`);

  dealHoleCards(state.players, deck, state.buttonIndex);

  const preflopStart = nextActiveSeat(state, bbSeat);
  await runBettingRound(state, preflopStart, getAction);

  if (countActiveNotFolded(state) <= 1) {
    return settleHand(state);
  }

  if (!canAnyoneAct(state)) {
    dealRemainingBoard(state, deck);
    return settleHand(state);
  }

  resetStreet(state, "FLOP");
  dealFlop(deck, state.board);
  if (canAnyoneAct(state)) {
    const flopStart = nextActiveSeat(state, state.buttonIndex);
    await runBettingRound(state, flopStart, getAction);
  }

  if (countActiveNotFolded(state) <= 1) {
    return settleHand(state);
  }
  if (!canAnyoneAct(state)) {
    dealRemainingBoard(state, deck);
    return settleHand(state);
  }

  resetStreet(state, "TURN");
  dealTurn(deck, state.board);
  if (canAnyoneAct(state)) {
    const turnStart = nextActiveSeat(state, state.buttonIndex);
    await runBettingRound(state, turnStart, getAction);
  }

  if (countActiveNotFolded(state) <= 1) {
    return settleHand(state);
  }
  if (!canAnyoneAct(state)) {
    dealRemainingBoard(state, deck);
    return settleHand(state);
  }

  resetStreet(state, "RIVER");
  dealRiver(deck, state.board);
  if (canAnyoneAct(state)) {
    const riverStart = nextActiveSeat(state, state.buttonIndex);
    await runBettingRound(state, riverStart, getAction);
  }

  return settleHand(state);
}

function settleHand(state) {
  const active = state.players.filter((p) => p.inHand && !p.hasFolded);
  const pots = buildSidePots(state.players);
  const showdown = [];

  if (state.board.length > 0) {
    logLine(state, `Board: ${formatCards(state.board)}`);
  }

  if (active.length > 1) {
    active.forEach((p) => {
      const evaluation = evaluate7([...p.hole, ...state.board]);
      showdown.push({
        playerId: p.id,
        hole: p.hole.slice(),
        evaluation,
      });
    });
  }

  const { payouts, potResults } = resolvePots(
    pots,
    state.players,
    state.board,
    state.buttonIndex
  );
  Object.keys(payouts).forEach((id) => {
    const playerId = Number(id);
    state.players[playerId].stack += payouts[playerId];
  });
  state.pot = 0;

  state.showdown = {
    board: state.board.slice(),
    pots,
    potResults,
    payouts,
    hands: showdown,
  };

  if (active.length > 1) {
    showdown.forEach((hand) => {
      const player = state.players[hand.playerId];
      logLine(
        state,
        `Showdown ${player.name}: ${formatCards(hand.hole)}`
      );
    });
  }

  potResults.forEach((result, idx) => {
    if (result.winners.length === 0) {
      return;
    }
    const names = result.winners
      .map((id) => state.players[id].name)
      .join(", ");
    logLine(state, `Pot ${idx + 1} (${result.pot.amount}) -> ${names}`);
  });

  return {
    board: state.board.slice(),
    actions: state.handActions.slice(),
    showdown: state.showdown,
    bb: state.config.BB,
  };
}

function createGameState(configOverride) {
  const config = configOverride || loadConfig();
  const rng = createRng(config.RNG_SEED);
  return {
    config,
    rng,
    players: createPlayers(config),
    buttonIndex: -1,
    handNumber: 0,
    board: [],
    pot: 0,
    betting: {},
    actionLog: [],
    handActions: [],
    showdown: null,
    onLog: null,
    equityAtFold: {},
  };
}

module.exports = {
  createGameState,
  playHand,
};
