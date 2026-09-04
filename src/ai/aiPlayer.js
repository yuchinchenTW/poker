const { chooseAction } = require("./strategy");
const { OpponentModel } = require("./opponentModel");

function createAIPlayer(id, rng, config, sharedOpponentModel) {
  // All AIs model the same human, so they can share one model.
  const opponentModel = sharedOpponentModel || new OpponentModel();
  return {
    id,
    opponentModel,
    decideAction(state, player, legalActions, logFn) {
      const result = chooseAction({
        state,
        player,
        legalActions,
        opponentModel,
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
      opponentModel.updateFromHand(handSummary, 0);
    },
  };
}

module.exports = {
  createAIPlayer,
};
