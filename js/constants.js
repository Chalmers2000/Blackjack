/* ======================================================================
   CONSTANTS — shared by all other scripts (classic <script> globals)
   ====================================================================== */

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYM = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

// Blackjack base values (Ace counted as 1 here; hand.js promotes it to 11 when it helps)
const RANK_VAL = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 10, Q: 10, K: 10,
};

const NUM_DECKS = 6;
const CUT_CARD = 78; // reshuffle when remaining cards drop to/below this (~25% of 6 decks)
const START_BANKROLL = 1000;
const MIN_BET = 5;
const BLACKJACK_PAYOUT = 1.5; // 3:2
const MAX_SPLITS = 1; // one split per round → at most 2 hands
const ODDS_TRIALS = 2000; // Monte Carlo trials for the win-probability badge
