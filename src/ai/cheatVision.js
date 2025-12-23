function getCheatInfo(state) {
  if (!state.config.CHEAT_MODE) {
    return null;
  }
  const human = state.players[0];
  if (!human || human.hasFolded || !human.inHand) {
    return null;
  }
  return {
    humanHole: human.hole.slice(),
  };
}

module.exports = {
  getCheatInfo,
};
