/* ======================================================================
   ODDS — Monte Carlo win-probability estimate for the corner badge.

   Simulates the dealer's remaining draws from the actual unseen pool
   (undealt shoe, plus the still-hidden hole card while it hasn't been
   revealed yet), applying the real "hit < 17, stand on all 17s" rule, and
   compares against the player's current total. Re-run after every card
   dealt to the active hand.

   `dealerKnownCards` is whatever the player can currently see of the
   dealer's hand — just the up card before the reveal, or the full hand
   (including any hits so far) once the hole card is revealed.
   ====================================================================== */

function simulateWinProbability(playerCards, dealerKnownCards, pool, trials = ODDS_TRIALS) {
  if (isBust(playerCards)) return 0;
  const playerTotal = handValue(playerCards).total;
  const n = pool.length;

  const work = pool.slice();
  let wins = 0;

  for (let t = 0; t < trials; t++) {
    let boundary = n;
    const draw = () => {
      const i = Math.floor(Math.random() * boundary);
      const card = work[i];
      boundary--;
      work[i] = work[boundary];
      work[boundary] = card;
      return card;
    };

    const dealerCards = dealerKnownCards.slice();
    let dv = handValue(dealerCards);
    while (dv.total < 17 && boundary > 0) {
      dealerCards.push(draw());
      dv = handValue(dealerCards);
    }

    if (dv.total > 21 || playerTotal > dv.total) wins++;
  }

  return wins / trials;
}
