/* ======================================================================
   HAND — blackjack hand-value math (soft/hard aces, bust, natural)
   ====================================================================== */

// Returns { total, soft } where `soft` means at least one Ace is currently
// counted as 11 and the hand is still <= 21.
function handValue(cards) {
  let total = cards.reduce((s, c) => s + c.value, 0); // aces start at 1 (see RANK_VAL)
  let aces = cards.filter(c => c.rank === 'A').length;
  let soft = false;
  while (aces > 0 && total + 10 <= 21) {
    total += 10;
    aces--;
    soft = true;
  }
  return { total, soft };
}

function isBust(cards) {
  return handValue(cards).total > 21;
}

// A "natural" blackjack: exactly two cards totalling 21.
function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

function isPair(cards) {
  return cards.length === 2 && cards[0].rank === cards[1].rank;
}
