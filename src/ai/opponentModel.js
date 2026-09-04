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
      // Only count a genuine raise; facing the unraised blinds preflop
      // should not inflate the fold-to-raise statistic.
      const facingBlindsOnly =
        action.street === "PREFLOP" &&
        typeof action.maxBetFaced === "number" &&
        typeof handSummary.bb === "number" &&
        action.maxBetFaced <= handSummary.bb;
      if (action.toCall && action.toCall > 0 && !facingBlindsOnly) {
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
    // Bayesian-style priors so a player we have barely seen gets a
    // population-average profile that observed hands gradually override.
    const PRIOR_WEIGHT = 5;
    const PRIOR_VPIP = 0.45;
    const PRIOR_PFR = 0.2;
    const vpip =
      (this.stats.vpipCount + PRIOR_VPIP * PRIOR_WEIGHT) /
      (this.stats.hands + PRIOR_WEIGHT);
    const pfr =
      (this.stats.pfrCount + PRIOR_PFR * PRIOR_WEIGHT) /
      (this.stats.hands + PRIOR_WEIGHT);
    const aggFactor =
      this.stats.postflopAggressive / Math.max(1, this.stats.postflopCalls);
    const PRIOR_FOLD_TO_RAISE = 0.35;
    const foldToRaise =
      (this.stats.foldToRaiseCount + PRIOR_FOLD_TO_RAISE * PRIOR_WEIGHT) /
      (this.stats.raiseOpportunities + PRIOR_WEIGHT);
    return {
      hands: this.stats.hands,
      vpip,
      pfr,
      aggFactor,
      foldToRaise,
    };
  }
}

// One model per seat. Betting actions are public, so a single registry can
// be shared by every AI; each AI simply reads the profiles of the opponents
// still in the hand.
class OpponentModels {
  constructor() {
    this.isRegistry = true;
    this.models = new Map();
  }

  get(playerId) {
    if (!this.models.has(playerId)) {
      this.models.set(playerId, new OpponentModel());
    }
    return this.models.get(playerId);
  }

  updateFromHand(handSummary) {
    const ids = new Set(
      Array.isArray(handSummary.playerIds)
        ? handSummary.playerIds
        : handSummary.actions.map((a) => a.playerId)
    );
    ids.forEach((id) => this.get(id).updateFromHand(handSummary, id));
  }

  getProfile(playerId) {
    return this.get(playerId).getProfile();
  }
}

module.exports = {
  OpponentModel,
  OpponentModels,
};
