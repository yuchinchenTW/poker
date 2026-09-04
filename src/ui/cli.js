const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { createGameState, playHand } = require("../engine/gameState");
const { loadConfig } = require("../engine/rules");
const {
  formatCards,
  formatStacks,
  formatActionLog,
  configureCardDisplay,
} = require("../utils/format");
const { createRng } = require("../utils/rng");
const { createAIPlayer } = require("../ai/aiPlayer");
const { estimateEquity } = require("../ai/equityMonteCarlo");
const { OpponentModels } = require("../ai/opponentModel");

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
  return state.config.EQUITY_DISPLAY_ITERATIONS || 1500;
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
  if (info.actionType !== "FOLD" || !state.config.SHOW_TABLE_EQUITY) {
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

function describeAction(action) {
  switch (action.type) {
    case "FOLD":
      return "Fold";
    case "CHECK":
      return "Check";
    case "CALL":
      return `Call ${action.amount}`;
    case "BET":
      return `Bet (${action.minAmount}-${action.maxAmount})`;
    case "RAISE":
      return `Raise to (${action.minAmount}-${action.maxAmount})`;
    case "ALL_IN":
      return `All-in (${action.amount})`;
    default:
      return action.type;
  }
}

// Menu order: passive options first, then sizing options, all-in last.
const MENU_ORDER = ["FOLD", "CHECK", "CALL", "BET", "RAISE", "ALL_IN"];

function buildMenu(legalActions) {
  return MENU_ORDER.map((type) =>
    legalActions.find((a) => a.type === type)
  ).filter(Boolean);
}

function buildSizePresets(action, state, player) {
  const toCall = Math.max(
    0,
    state.betting.currentStreetMaxBet - player.currentBet
  );
  // Pot the opponent would be facing once we have matched the current bet.
  const potForSizing = state.pot + toCall;
  const base = action.type === "RAISE" ? state.betting.currentStreetMaxBet : 0;
  const clampAmount = (value) =>
    Math.min(action.maxAmount, Math.max(action.minAmount, Math.round(value)));
  const presets = [
    { label: "Min", amount: action.minAmount },
    { label: "1/3 pot", amount: clampAmount(base + potForSizing / 3) },
    { label: "1/2 pot", amount: clampAmount(base + potForSizing / 2) },
    { label: "3/4 pot", amount: clampAmount(base + potForSizing * 0.75) },
    { label: "Pot", amount: clampAmount(base + potForSizing) },
    { label: "Max (all-in)", amount: action.maxAmount },
  ];
  // Drop duplicates (e.g. when several presets clamp to the same value).
  const seen = new Set();
  return presets.filter((preset) => {
    if (seen.has(preset.amount)) {
      return false;
    }
    seen.add(preset.amount);
    return true;
  });
}

async function promptAmount(rl, action, state, player) {
  const verb = action.type === "BET" ? "Bet" : "Raise to";
  const presets = buildSizePresets(action, state, player);
  while (true) {
    console.log("");
    console.log(`${verb}:`);
    presets.forEach((preset, idx) => {
      console.log(`  ${idx + 1}) ${preset.label.padEnd(13)} ${preset.amount}`);
    });
    console.log(`  ${presets.length + 1}) Custom amount`);
    console.log("  0) Back");
    const answer = (await rl.question("> ")).trim().toLowerCase();
    if (!answer) {
      continue;
    }
    if (answer === "0" || answer === "back" || answer === "b") {
      return null;
    }
    if (answer === "q" || answer === "quit") {
      process.exit(0);
    }
    if (answer === "help" || answer === "h" || answer === "?") {
      console.log(
        `Pick a preset number, type an amount (${action.minAmount}-${action.maxAmount}), or 0 to go back.`
      );
      continue;
    }
    const choice = Number(answer);
    if (Number.isInteger(choice) && choice >= 1 && choice <= presets.length) {
      return presets[choice - 1].amount;
    }
    let numeric = null;
    if (choice === presets.length + 1) {
      const raw = (
        await rl.question(
          `Amount (${action.minAmount}-${action.maxAmount}): `
        )
      ).trim();
      numeric = Number(raw);
    } else {
      // Allow typing the amount directly at the menu.
      numeric = Number(answer);
    }
    if (!Number.isFinite(numeric)) {
      console.log("Invalid amount.");
      continue;
    }
    if (numeric < action.minAmount || numeric > action.maxAmount) {
      console.log(
        `Amount must be between ${action.minAmount} and ${action.maxAmount}.`
      );
      continue;
    }
    return numeric;
  }
}

function printTable(state, player, toCall) {
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
  console.log(`Stacks: ${formatStacks(state.players, state)}`);
  console.log("Action log:");
  console.log(formatActionLog(state.actionLog, state.config.ACTION_LOG_LIMIT));
}

function printMenu(menu) {
  console.log("");
  console.log("Choose an action:");
  menu.forEach((action, idx) => {
    console.log(`  ${idx + 1}) ${describeAction(action)}`);
  });
  console.log("  q) Quit");
}

async function resolveMenuChoice(rl, action, state, player) {
  if (action.type === "BET" || action.type === "RAISE") {
    const amount = await promptAmount(rl, action, state, player);
    if (amount === null) {
      return null;
    }
    return { type: action.type, amount };
  }
  return { type: action.type };
}

async function promptHumanAction(rl, player, state, legalActions) {
  const toCall = Math.max(0, state.betting.currentStreetMaxBet - player.currentBet);
  const menu = buildMenu(legalActions);
  let showTable = true;
  while (true) {
    if (showTable) {
      printTable(state, player, toCall);
    }
    showTable = false;
    printMenu(menu);
    const answer = (await rl.question("> ")).trim().toLowerCase();

    if (!answer) {
      continue;
    }
    if (answer === "help" || answer === "h" || answer === "?") {
      console.log(`Legal actions: ${formatLegalOptions(legalActions)}`);
      console.log(
        "Pick a number, or type: fold / check / call / bet <amount> / raise <amount> / allin / quit"
      );
      continue;
    }
    if (answer === "quit" || answer === "q") {
      process.exit(0);
    }

    // Numbered menu choice.
    const choice = Number(answer);
    if (Number.isInteger(choice) && choice >= 1 && choice <= menu.length) {
      const resolved = await resolveMenuChoice(rl, menu[choice - 1], state, player);
      if (resolved) {
        return resolved;
      }
      continue;
    }

    // Typed commands remain supported.
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
      const action = legalActions.find((a) => a.type === cmd.toUpperCase());
      if (!action) {
        console.log("That action is not legal right now.");
        continue;
      }
      if (value === undefined) {
        const amount = await promptAmount(rl, action, state, player);
        if (amount === null) {
          continue;
        }
        return { type: action.type, amount };
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        console.log("Invalid amount.");
        continue;
      }
      if (numeric < action.minAmount || numeric > action.maxAmount) {
        console.log(
          `Amount must be between ${action.minAmount} and ${action.maxAmount}.`
        );
        continue;
      }
      return { type: action.type, amount: numeric };
    }

    console.log("Invalid choice. Enter a number from the menu or type 'help'.");
  }
}

async function startCli() {
  const config = loadConfig();
  configureCardDisplay({
    unicodeSuits: config.UNICODE_SUITS,
    color: config.COLOR && Boolean(output.isTTY),
  });
  const state = createGameState(config);
  const rl = readline.createInterface({ input, output });
  // Separate RNG for AI sampling so the deck shuffle sequence does not
  // depend on how many Monte Carlo iterations the AI ran.
  const aiRng = createRng(
    config.RNG_SEED ? `${config.RNG_SEED}-ai` : ""
  );
  // One profile per seat (human and AIs alike), shared by all AIs.
  const models = new OpponentModels();
  const aiPlayers = {
    1: createAIPlayer(1, aiRng, config, models),
    2: createAIPlayer(2, aiRng, config, models),
    3: createAIPlayer(3, aiRng, config, models),
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
    models.updateFromHand(handSummary);
  }

  console.log("Game over.");
  rl.close();
}

module.exports = {
  startCli,
};
