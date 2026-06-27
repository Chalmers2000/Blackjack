# Blackjack — Implementation Plan

## 1. Reference takeaways from baccarat-reference

`baccarat.html` is a single-file game with a consistent visual language and a specific
animation/timing system. We'll reuse its design language but split code into separate
files (per spec requirement #2), and adapt the game logic for blackjack.

What to carry over almost verbatim:
- **Felt table look**: dark radial-gradient green felt, gold border/accents, Georgia
  serif headings, `--gold`/`--felt-green`/etc. CSS variables.
- **Card visual + deal animation**: `.card` flip-in keyframes (`cardIn`: translateY +
  rotateY 90°→45°→0°, opacity 0→1), corner rank/suit, center rank/suit, red/black coloring.
- **Chips**: circular dashed-border chips in 4 denominations ($5/$25/$100/$500), same
  colors (`--chip-5`, `--chip-25`, `--chip-100`, `--chip-500`), hover scale, click-to-stack
  betting.
- **Timing model**: a single `delay(ms)` helper multiplied by a `fastMode` flag (Normal=4x,
  Fast=2x base unit) so every animation reacts to one speed toggle (`⚡ Normal/Fast` button,
  fixed bottom-right).
- **Result banner**: centered overlay banner that fades/scales in over the table, color-coded
  per outcome, with a payout sub-line.
- **History table + stats row**: table pinned across the bottom of the table, fixed visible
  window (last N rounds), plus a stats line (counts + running P&L) below it.
- **Toast** (top-center, e.g. reshuffle notice), **bankrupt overlay** (full-screen, "New Game"
  button), **rules side panel** (collapsible on mobile, sticky on desktop), **ARIA live
  region** for accessibility, **tiny Web Audio synth** for card/chip/win/lose/push sounds.
- **Keyboard shortcuts** mapped to the current phase's primary actions.

What changes for blackjack:
- No Player/Banker/Tie bet targets — a single bet spot, then Deal.
- An active player-turn phase with action buttons (Hit / Stand / Double / Split) instead of
  baccarat's fully automatic resolution.
- Multiple simultaneous player hands when a split occurs.
- A win-probability readout in a corner (new — baccarat has no equivalent), recalculated
  after every card.
- 6-deck shoe instead of 8-deck.

## 2. File structure

Split into dedicated files (unlike the single-file baccarat reference), using classic
`<script src>` tags (not ES modules) so the game still runs by double-clicking
`index.html` directly (`file://`) without hitting module CORS restrictions:

```
index.html
css/
  styles.css        # ported felt/card/chip/banner/history/rules theme + blackjack tweaks
js/
  constants.js       # suits, ranks, values, NUM_DECKS=6, payouts, bankroll/min bet
  shoe.js             # createShoe(), drawCard(), reshuffle threshold, remaining-count helpers
  hand.js             # hand value (soft/hard ace handling), bust/blackjack detection
  odds.js             # win-probability estimation (see §5)
  audio.js            # tiny Web Audio synth (ported tones: card/chip/win/lose/push)
  ui.js               # all DOM rendering: cards, chips, banner, history, stats, odds corner, toasts
  game.js             # state machine + round flow: betting → dealing → playerTurn → dealerTurn → result
  main.js             # event wiring, keyboard shortcuts, init
```

## 3. Visual / DOM layout (index.html)

Mirrors baccarat's `.page-layout` (game column + sticky rules panel):
- Header: title, balance, shoe count.
- **Odds corner**: small pinned badge (e.g. top-right of table, like `position:absolute`
  inside `.table-wrap`) showing "Win chance: NN%", updated after every card dealt.
- Card table: one "Dealer" hand-zone and one or more "Player" hand-zones (a horizontal row
  of hand-zones rendered dynamically when split occurs; the active hand is visually
  highlighted while others are dimmed/inactive).
- Result banner (reused per hand on multi-hand resolution, or a single banner that cycles
  per hand when split is active).
- Betting area: bet spot (no target buttons needed) + 4 chips + Clear/Deal/Rebet.
- **Action row** (only visible during player turn): Hit, Stand, Double Down, Split — each
  disabled/enabled per blackjack legality (Double only on first two cards with sufficient
  bankroll; Split only on a pair with sufficient bankroll, capped at one split → 2 hands).
- Scoreboard: history table across the bottom (Win / Loss / Push per round, color-coded like
  baccarat's P/B rows) + stats row (Wins, Losses, Pushes, Blackjacks, Rounds, P&L).
- Rules panel: rewritten content — card values, dealer rules (stands on all 17s), blackjack
  pays 3:2, double/split rules, when odds are shown, house edge note, keyboard shortcuts.
- Reused: bankrupt overlay, reshuffle toast, speed toggle, ARIA live region.

## 4. Core game rules to implement

- **Shoe**: 6 standard 52-card decks, Fisher-Yates shuffle, reshuffle when remaining cards
  fall below a cut-card threshold (scaled down from baccarat's 104/8-decks → e.g. ~78 for
  6 decks), with the same toast notice.
- **Dealing**: player gets 2 cards, dealer gets 2 (one face-down "hole" card), animated one
  at a time like baccarat's alternating deal.
- **Blackjack check**: natural 21 for player and/or dealer checked immediately after the
  initial deal; resolves immediately (3:2 payout on player natural unless dealer also has
  blackjack → push).
- **Player turn** (per active hand if split):
  - Hit: draw one card, re-render, recalc total + odds; bust ends that hand immediately.
  - Stand: lock hand, move to next hand or dealer turn.
  - Double Down: only on initial 2-card hand with bankroll ≥ current bet; doubles the bet,
    draws exactly one card, then auto-stands.
  - Split: only when the two cards have equal rank and bankroll ≥ current bet; splits into
    two independent hands, each completed in turn (cap at one split, i.e. no re-splitting,
    to keep scope aligned with the spec).
- **Dealer turn**: reveal hole card, then hit until total ≥ 17 (stand on all 17s, including
  soft 17 — simplest, most common rule, documented in the rules panel), animated with the
  same per-card delays as baccarat's third-card draws. Skipped entirely if all player hands
  already busted.
- **Resolution per hand**: compare totals; standard payouts — blackjack 3:2, regular win 1:1,
  push returns stake, bust/loss forfeits stake already deducted at Deal time (same bookkeeping
  pattern as baccarat: deduct on Deal, add back net on resolve).
- **History/stats update**: one row per round (or per split scenario, one aggregated row),
  bankroll/P&L tracking, bankrupt overlay when balance hits 0.

## 5. Win-probability ("odds corner") calculation

Recalculated after every dealt card, must reflect the *actual remaining shoe composition*
(not an idealized infinite-deck assumption), per spec requirement #3.

**Approach: Monte Carlo simulation**, run synchronously each time a card is dealt to the
active hand:
1. Build the pool of unseen cards = full remaining shoe (dealer hole card is *not* removed
   from the pool — it's unknown to the player, so for probability purposes it's just another
   unseen card drawn from the same pool).
2. Run N simulated playouts (e.g. 1,500–3,000 trials — tunable for a snappy UI):
   - Shuffle a copy of the pool, deal the dealer's hidden hole card + any further dealer hits
     from it, applying the real dealer rule (hit <17, stand ≥17).
   - The player's hand is fixed as dealt so far for that hand (if the player would still act,
     this represents "win probability if I stand now"; the spec only asks for odds after each
     dealt card, so this matches the most natural reading: current-hand-strength vs the shoe).
   - Compare final totals → win/push/loss for that trial.
3. Win% = wins / N (optionally show push% too, or fold pushes out of the denominator —
   decide during implementation/UI polish).
4. Memoize/debounce so it only recomputes when the visible card set actually changes.

This is simpler and more robust than an exact recursive distribution (which gets
complicated with split hands and double-down branches) while still being driven by the
true remaining-shoe composition rather than a static probability table.

## 6. Animation & timing parity with baccarat

- Reuse `cardIn` keyframes and per-card stagger via `animation-delay`.
- Reuse the `delay(ms)` × `fastMode` pattern for all `await`-based pacing between deal steps,
  dealer hits, and banner reveal.
- Reuse chip-click and result sounds (card flip / chip / win / lose / push tones) via the
  same tiny oscillator-based synth, no audio assets needed.
- Reuse toast (reshuffle) and overlay (bankrupt) fade transitions verbatim.

## 7. Build order

1. Static markup + CSS port (table, chips, betting area, action row, rules panel, overlays) —
   visually verify it matches the baccarat look/feel before wiring logic.
2. `constants.js`, `shoe.js`, `hand.js` — shoe creation, draw, hand value/bust/blackjack logic
   (unit-testable in isolation via the browser console).
3. `game.js` state machine for the simple no-split/no-double path: bet → deal → dealer auto +
   player stand-only → resolve → history/stats. Get core loop and payouts correct first.
4. Add Hit/Stand interactivity, then Double Down, then Split (multi-hand rendering + per-hand
   resolution) — each as an incremental, testable slice.
5. `odds.js` Monte Carlo win-probability + corner badge, wired to recompute after every dealt
   card.
6. `audio.js`, toasts, bankrupt overlay, reshuffle, speed toggle, keyboard shortcuts, rules
   panel content, ARIA live region — parity polish pass against baccarat.
7. Manual test pass: natural blackjack (player/dealer/both), bust, push, double down win/loss,
   split with one hand busting, shoe reshuffle, bankroll reaching $0, fast-mode toggle, keyboard
   shortcuts, odds value sanity-checked against known scenarios (e.g. player 20 vs dealer
   showing 6 should show a high win%).

## 8. Open questions to confirm before/while building

- Soft 17: dealer stands on all 17s (recommended, simplest) vs. hits soft 17 — plan assumes
  the former unless told otherwise.
- Split scope: cap at one split (2 hands, no re-splitting, no split aces special-casing) —
  flag if re-splitting / split-aces-draw-one-card-only rules are wanted.
- Odds metric: show pure win% (push counted as neither) or win%-vs-not-lose% — minor UI
  wording decision, doesn't affect the simulation engine.
