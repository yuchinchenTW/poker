const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { createGameState, playHand } = require("../engine/gameState");
const { loadConfig } = require("../engine/rules");
const { formatCards, formatStacks, formatActionLog } = require("../utils/format");
const { createRng } = require("../utils/rng");
const { createAIPlayer } = require("../ai/aiPlayer");
const { estimateEquity } = require("../ai/equityMonteCarlo");

function formatLegalOptions(legalActions) {
  const parts = [];
  legalActions.forEach((action) => {
    switch (action.type) {
      case "FOLD":
        parts.push("fold");
        break;
      case "CHECK":
        parts.push("check");
        break;
      case "CALL":
        parts.push(`call ${action.amount}`);
        break;
      case "BET":
        parts.push(
          `bet ${action.minAmount}-${action.maxAmount}`
        );
        break;
      case "RAISE":
        parts.push(
          `raise ${action.minAmount}-${action.maxAmount}`
        );
        break;
      case "ALL_IN":
        parts.push("allin");
        break;
      default:
        break;
    }
  });
  return parts.join(", ");
}

function getEquityIterations(state) {
  const perStreet = {
    PREFLOP: state.config.AI_ITERATIONS_PREFLOP,
    FLOP: state.config.AI_ITERATIONS_FLOP,
    TURN: state.config.AI_ITERATIONS_TURN,
    RIVER: state.config.AI_ITERATIONS_RIVER,
  };
  const fallback = state.config.EQUITY_DISPLAY_ITERATIONS || 1500;
  return perStreet[state.betting.street] || fallback;
}

function buildEquitySeed(state, suffix) {
  if (!state.config.RNG_SEED) {
    return "";
  }
  return `${state.config.RNG_SEED}-equity-${state.handNumber}-${state.betting.street}-${state.handActions.length}-${suffix}`;
}

function estimatePlayerEquity(state, player, includeKnownOpponents) {
  const opponents = state.players.filter(
    (p) => p.inHand && !p.hasFolded && p.id !== player.id
  );
  if (opponents.length === 0) {
    return 1;
  }
  const knownOpponentsHoles = includeKnownOpponents
    ? opponents.map((p) => p.hole).filter((hole) => hole && hole.length === 2)
    : [];
  const equityRng = createRng(buildEquitySeed(state, `p${player.id}`));
  const iterations = getEquityIterations(state);
  const result = estimateEquity({
    heroHole: player.hole,
    board: state.board,
    numOpponents: opponents.length,
    knownOpponentsHoles,
    iterations,
    rng: equityRng,
  });
  return result.equity;
}

function recordFoldEquity(info, state) {
  if (info.actionType !== "FOLD") {
    return;
  }
  if (!state.equityAtFold) {
    state.equityAtFold = {};
  }
  if (state.equityAtFold[info.player.id] !== undefined) {
    return;
  }
  const equity = estimatePlayerEquity(state, info.player, true);
  state.equityAtFold[info.player.id] = equity;
}

async function promptHumanAction(rl, player, state, legalActions) {
  const toCall = Math.max(0, state.betting.currentStreetMaxBet - player.currentBet);
  while (true) {
    console.log("");
    console.log(`Board: ${formatCards(state.board)}`);
    console.log(`Your hand: ${formatCards(player.hole)}`);
    console.log(`Pot=${state.pot}`);
    console.log(`ToCall=${toCall}`);
    if (state.config.SHOW_TABLE_EQUITY) {
      const equities = state.players
        .map((p) => {
          if (!p.inHand) {
            return `${p.name}:OUT`;
          }
          if (p.hasFolded) {
            const stored = state.equityAtFold ? state.equityAtFold[p.id] : undefined;
            if (stored !== undefined) {
              return `${p.name}:${(stored * 100).toFixed(1)}%`;
            }
            return `${p.name}:0.0%`;
          }
          const equity = estimatePlayerEquity(state, p, true);
          return `${p.name}:${(equity * 100).toFixed(1)}%`;
        })
        .join(" ");
      console.log(`Equity: ${equities}`);
    } else if (state.config.SHOW_EQUITY) {
      const equity = estimatePlayerEquity(state, player, false);
      console.log(`Equity: ${(equity * 100).toFixed(1)}%`);
    }
    console.log(`Stacks: ${formatStacks(state.players)}`);
    console.log("Action log:");
    console.log(formatActionLog(state.actionLog, state.config.ACTION_LOG_LIMIT));
    const answer = (await rl.question("> ")).trim().toLowerCase();

    if (!answer) {
      continue;
    }
    if (answer === "help") {
      console.log(`Legal actions: ${formatLegalOptions(legalActions)}`);
      continue;
    }
    if (answer === "quit") {
      process.exit(0);
    }

    const [cmd, value] = answer.split(/\s+/);
    if (cmd === "fold" && legalActions.some((a) => a.type === "FOLD")) {
      return { type: "FOLD" };
    }
    if (cmd === "check" && legalActions.some((a) => a.type === "CHECK")) {
      return { type: "CHECK" };
    }
    if (cmd === "call" && legalActions.some((a) => a.type === "CALL")) {
      return { type: "CALL" };
    }
    if (cmd === "allin" && legalActions.some((a) => a.type === "ALL_IN")) {
      return { type: "ALL_IN" };
    }
    if (cmd === "bet" || cmd === "raise") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        console.log("Invalid amount.");
        continue;
      }
      const action = legalActions.find((a) => a.type === cmd.toUpperCase());
      if (!action) {
        console.log("That action is not legal right now.");
        continue;
      }
      if (numeric < action.minAmount || numeric > action.maxAmount) {
        console.log(
          `Amount must be between ${action.minAmount} and ${action.maxAmount}.`
        );
        continue;
      }
      return { type: cmd.toUpperCase(), amount: numeric };
    }

    console.log("Invalid command. Type 'help' for options.");
  }
}

async function startCli() {
  const config = loadConfig();
  const state = createGameState(config);
  const rl = readline.createInterface({ input, output });
  const aiPlayers = {
    1: createAIPlayer(1, state.rng, config),
    2: createAIPlayer(2, state.rng, config),
    3: createAIPlayer(3, state.rng, config),
  };

  const getAction = async (player, gameState, legalActions) => {
    if (player.isHuman) {
      return promptHumanAction(rl, player, gameState, legalActions);
    }
    const ai = aiPlayers[player.id];
    return ai.decideAction(gameState, player, legalActions, (line) =>
      console.log(line)
    );
  };

  while (true) {
    const activePlayers = state.players.filter((p) => p.inHand);
    if (activePlayers.length < 2 || state.players[0].stack <= 0) {
      break;
    }
    const handSummary = await playHand(
      state,
      getAction,
      (line) => console.log(line),
      recordFoldEquity
    );
    if (!handSummary) {
      break;
    }
    Object.values(aiPlayers).forEach((ai) => ai.recordHand(handSummary));
  }

  console.log("Game over.");
  rl.close();
}

module.exports = {
  startCli,
};
