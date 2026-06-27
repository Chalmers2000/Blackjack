/* ======================================================================
   SHOE — 6-deck shoe creation, shuffling, drawing
   ====================================================================== */

function createShoe() {
  const shoe = [];
  for (let d = 0; d < NUM_DECKS; d++) {
    for (const s of SUITS) {
      for (const r of RANKS) {
        shoe.push({ suit: s, rank: r, value: RANK_VAL[r] });
      }
    }
  }
  shuffleShoe(shoe);
  return shoe;
}

function shuffleShoe(shoe) {
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

// Draws from the live game shoe (mutates state.shoe). Reshuffling on empty is a
// safety net only — the real reshuffle happens at CUT_CARD between rounds.
function drawCard(shoeArr) {
  return shoeArr.pop();
}
