const { shuffle } = require("../utils/rng");

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["s", "h", "d", "c"];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

function shuffleDeck(deck, rng) {
  return shuffle(deck, rng);
}

function nextActiveSeat(players, fromIndex) {
  const total = players.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const idx = (fromIndex + offset) % total;
    if (players[idx].inHand) {
      return idx;
    }
  }
  return -1;
}

function dealHoleCards(players, deck, buttonIndex) {
  const activeCount = players.filter((p) => p.inHand).length;
  if (activeCount === 0) {
    return;
  }
  let cursor = buttonIndex;
  for (let round = 0; round < 2; round += 1) {
    for (let dealt = 0; dealt < activeCount; dealt += 1) {
      cursor = nextActiveSeat(players, cursor);
      if (cursor === -1) {
        return;
      }
      players[cursor].hole.push(deck.pop());
    }
  }
}

function burn(deck) {
  return deck.pop();
}

function dealFlop(deck, board) {
  burn(deck);
  board.push(deck.pop(), deck.pop(), deck.pop());
}

function dealTurn(deck, board) {
  burn(deck);
  board.push(deck.pop());
}

function dealRiver(deck, board) {
  burn(deck);
  board.push(deck.pop());
}

module.exports = {
  createDeck,
  shuffleDeck,
  dealHoleCards,
  dealFlop,
  dealTurn,
  dealRiver,
};
