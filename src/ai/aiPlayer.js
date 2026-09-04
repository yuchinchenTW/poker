const { chooseAction } = require("./strategy");
const { OpponentModels } = require("./opponentModel");

// `models` is a shared OpponentModels registry (one profile per seat).
// Betting actions are public, so all AIs can read the same registry.
function createAIPlayer(id, rng, config, models) {
  const opponentModels =
    models && models.isRegistry ? models : new OpponentModels();
  return {
    id,
    opponentModels,
    decideAction(state, player, legalActions, logFn) {
      const result = chooseAction({
        state,
        player,
        legalActions,
        opponentModels,
        rng,
      });
      if (config.DEBUG && logFn) {
        logFn(
          `${player.name} AI debug: equity=${result.debug.equity.toFixed(
            3
          )} foldEq=${result.debug.foldEquity.toFixed(2)} cheat=${
            result.debug.cheatUsed
          }`
        );
      }
      return result.action;
    },
    recordHand(handSummary) {
      opponentModels.updateFromHand(handSummary);
    },
  };
}

module.exports = {
  createAIPlayer,
};
