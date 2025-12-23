class OpponentModel {
  constructor() {
    this.stats = {
      hands: 0,
      vpipCount: 0,
      pfrCount: 0,
      postflopAggressive: 0,
      postflopCalls: 0,
      foldToRaiseCount: 0,
      raiseOpportunities: 0,
      showdownHands: [],
    };
  }

  updateFromHand(handSummary, opponentId) {
    this.stats.hands += 1;
    let vpip = false;
    let pfr = false;
    let postflopAgg = 0;
    let postflopCalls = 0;
    let foldToRaise = false;
    let sawRaiseOpportunity = false;

    handSummary.actions.forEach((action) => {
      if (action.playerId !== opponentId) {
        return;
      }
      if (action.street === "PREFLOP" && !action.forced) {
        if (["CALL", "RAISE", "BET", "ALL_IN"].includes(action.type)) {
          vpip = true;
        }
        if (["RAISE", "BET", "ALL_IN"].includes(action.type)) {
          pfr = true;
        }
      }
      if (action.street !== "PREFLOP") {
        if (["RAISE", "BET", "ALL_IN"].includes(action.type)) {
          postflopAgg += 1;
        }
        if (action.type === "CALL") {
          postflopCalls += 1;
        }
      }
      if (action.toCall && action.toCall > 0) {
        sawRaiseOpportunity = true;
        if (action.type === "FOLD") {
          foldToRaise = true;
        }
      }
    });

    if (vpip) this.stats.vpipCount += 1;
    if (pfr) this.stats.pfrCount += 1;
    this.stats.postflopAggressive += postflopAgg;
    this.stats.postflopCalls += postflopCalls;
    if (sawRaiseOpportunity) {
      this.stats.raiseOpportunities += 1;
      if (foldToRaise) this.stats.foldToRaiseCount += 1;
    }

    if (handSummary.showdown && handSummary.showdown.hands) {
      handSummary.showdown.hands.forEach((hand) => {
        if (hand.playerId === opponentId) {
          this.stats.showdownHands.push(hand.hole.slice());
        }
      });
    }
  }

  getProfile() {
    const hands = Math.max(1, this.stats.hands);
    const raiseOpps = Math.max(1, this.stats.raiseOpportunities);
    const vpip = this.stats.vpipCount / hands;
    const pfr = this.stats.pfrCount / hands;
    const aggFactor =
      this.stats.postflopAggressive / Math.max(1, this.stats.postflopCalls);
    const foldToRaise = this.stats.foldToRaiseCount / raiseOpps;
    return {
      vpip,
      pfr,
      aggFactor,
      foldToRaise,
    };
  }
}

module.exports = {
  OpponentModel,
};
