/* ======================================================================
   GAME — blackjack state machine: betting → playerTurn → dealerTurn →
   result → betting. Exposes a single global `BJ` object for main.js.
   ====================================================================== */

const BJ = (() => {
  let state = {
    bankroll: START_BANKROLL,
    bet: { amount: 0 },
    prevBetAmount: null,
    shoe: [],
    dealerHand: [],
    dealerHoleEl: null,
    dealerHoleRevealed: false,
    playerHands: [], // { cards, bet, status, natural, zone }
    activeHandIndex: 0,
    splitsUsed: 0,
    phase: 'betting', // betting | dealing | playerTurn | dealerTurn | result
    history: [],
    stats: { wins: 0, losses: 0, pushes: 0, blackjacks: 0, rounds: 0, pnl: 0 },
    fastMode: false,
  };

  function delay(ms) {
    return new Promise(r => setTimeout(r, ms * (state.fastMode ? 2 : 4)));
  }

  function createHand(betAmount) {
    return { cards: [], bet: betAmount, status: 'active', natural: false, zone: null, result: null };
  }

  function updateShoeDisplay() { UI.updateShoe(state.shoe.length); }

  function statusLabel(hand) {
    switch (hand.status) {
      case 'busted': return 'BUST';
      case 'blackjack': return 'BLACKJACK';
      case 'stood': return 'STAND';
      case 'doubled': return 'DOUBLED';
      default: return '';
    }
  }

  function updateHandDisplay(idx) {
    const hand = state.playerHands[idx];
    const hv = handValue(hand.cards);
    UI.updateHandTotal(hand.zone.totalEl, hv.total, {
      natural: hand.status === 'blackjack',
      busted: hand.status === 'busted',
    });
    UI.updateHandStatus(hand.zone.statusEl, statusLabel(hand));
  }

  function updateAllHandZonesActiveHighlight() {
    state.playerHands.forEach((h, i) => {
      UI.setActiveZone(h.zone.zoneDiv, state.phase === 'playerTurn' && i === state.activeHandIndex);
    });
  }

  // Rebuilds the player-hands-row from scratch. Existing cards are redrawn
  // silently (no animation/sound); only used on a fresh deal or right after
  // a split, where the hand count itself has just changed.
  function renderHandZones() {
    UI.refs.playerHandsRowEl.innerHTML = '';
    state.playerHands.forEach((hand, i) => {
      const labelText = state.playerHands.length > 1 ? `Player ${i + 1}` : 'Player';
      hand.zone = UI.createHandZone(labelText, state.phase === 'playerTurn' && i === state.activeHandIndex);
      hand.cards.forEach(c => UI.dealCard(hand.zone.cardsRow, c, false, true));
      updateHandDisplay(i);
    });
  }

  function updateDealerDisplay(includeHidden) {
    const cards = includeHidden ? state.dealerHand : [state.dealerHand[0]];
    const hv = handValue(cards);
    UI.setDealerTotal(hv.total, {
      natural: includeHidden && isBlackjack(state.dealerHand),
      busted: includeHidden && hv.total > 21,
    });
  }

  async function dealCardToHand(idx, t) {
    const card = drawCard(state.shoe);
    state.playerHands[idx].cards.push(card);
    UI.dealCard(state.playerHands[idx].zone.cardsRow, card, false);
    updateHandDisplay(idx);
    await delay(t);
  }

  async function dealCardToDealer(faceDown, t) {
    const card = drawCard(state.shoe);
    state.dealerHand.push(card);
    const el = UI.dealCard(UI.refs.dealerCardsEl, card, faceDown);
    if (faceDown) state.dealerHoleEl = el;
    updateDealerDisplay(false);
    await delay(t);
  }

  async function revealDealerHole() {
    if (state.dealerHoleRevealed) return;
    state.dealerHoleRevealed = true;
    UI.revealCard(state.dealerHoleEl, state.dealerHand[1]);
    sndCard();
    updateDealerDisplay(true);
    await delay(400);
  }

  function getUnseenPool() {
    return state.dealerHoleRevealed
      ? state.shoe.slice()
      : state.shoe.concat(state.dealerHand[1] ? [state.dealerHand[1]] : []);
  }
  function getDealerKnownCards() {
    return state.dealerHoleRevealed ? state.dealerHand.slice() : [state.dealerHand[0]];
  }

  function updateOddsForActiveHand() {
    if (state.phase !== 'playerTurn') { UI.updateOddsBadge(null); return; }
    const hand = state.playerHands[state.activeHandIndex];
    if (!hand) { UI.updateOddsBadge(null); return; }
    const pct = simulateWinProbability(hand.cards, getDealerKnownCards(), getUnseenPool());
    UI.updateOddsBadge(pct);
  }

  function disableActionButtons() {
    UI.refs.btnHit.disabled = true;
    UI.refs.btnStand.disabled = true;
    UI.refs.btnDouble.disabled = true;
    UI.refs.btnSplit.disabled = true;
  }

  function refreshActionButtons() {
    const hand = state.playerHands[state.activeHandIndex];
    if (state.phase !== 'playerTurn' || !hand) {
      UI.refs.playerActionRow.style.display = 'none';
      return;
    }
    UI.refs.playerActionRow.style.display = '';
    const active = hand.status === 'active';
    UI.refs.btnHit.disabled = !active;
    UI.refs.btnStand.disabled = !active;
    UI.refs.btnDouble.disabled = !(active && hand.cards.length === 2 && state.bankroll >= hand.bet);
    UI.refs.btnSplit.disabled = !(active && hand.cards.length === 2 && isPair(hand.cards) &&
      state.splitsUsed < MAX_SPLITS && state.bankroll >= hand.bet);
  }

  function setBettingButtonsDisabled(disabled) {
    UI.refs.btnClear.disabled = disabled;
    UI.refs.btnDeal.disabled = disabled;
    UI.refs.btnRebet.disabled = disabled;
    UI.setBettingControlsEnabled(!disabled);
  }

  function setPhaseBetting() {
    state.phase = 'betting';
    setBettingButtonsDisabled(false);
    UI.refs.btnClear.disabled = state.bet.amount === 0;
    UI.refs.btnDeal.disabled = state.bet.amount < MIN_BET || state.bet.amount > state.bankroll;
    if (state.prevBetAmount) {
      UI.refs.btnRebet.style.display = '';
      UI.refs.btnRebet.disabled = state.prevBetAmount > state.bankroll;
    } else {
      UI.refs.btnRebet.style.display = 'none';
    }
  }

  // ─── ROUND FLOW ───

  async function dealRound() {
    initAudio();
    UI.clearTable();
    state.phase = 'dealing';
    setBettingButtonsDisabled(true);
    disableActionButtons();
    UI.refs.playerActionRow.style.display = 'none';
    UI.updateOddsBadge(null);

    state.dealerHand = [];
    state.dealerHoleEl = null;
    state.dealerHoleRevealed = false;
    state.splitsUsed = 0;
    state.playerHands = [createHand(state.bet.amount)];
    state.activeHandIndex = 0;
    renderHandZones();

    const t = 350;
    await dealCardToHand(0, t);
    await dealCardToDealer(false, t);
    await dealCardToHand(0, t);
    await dealCardToDealer(true, t);

    updateShoeDisplay();

    const playerNatural = isBlackjack(state.playerHands[0].cards);
    const dealerNatural = isBlackjack(state.dealerHand);

    if (playerNatural || dealerNatural) {
      state.playerHands[0].natural = playerNatural;
      if (playerNatural) {
        state.playerHands[0].status = 'blackjack';
        updateHandDisplay(0);
      }
      await delay(500);
      await revealDealerHole();
      await finishRound();
      return;
    }

    enterPlayerTurn();
  }

  function enterPlayerTurn() {
    state.phase = 'playerTurn';
    state.activeHandIndex = 0;
    updateAllHandZonesActiveHighlight();
    refreshActionButtons();
    updateOddsForActiveHand();
  }

  async function advanceToNextHandOrDealer() {
    let next = -1;
    for (let i = state.activeHandIndex + 1; i < state.playerHands.length; i++) {
      if (state.playerHands[i].status === 'active') { next = i; break; }
    }
    if (next !== -1) {
      state.activeHandIndex = next;
      updateAllHandZonesActiveHighlight();
      refreshActionButtons();
      updateOddsForActiveHand();
    } else {
      state.phase = 'dealerTurn';
      UI.refs.playerActionRow.style.display = 'none';
      updateAllHandZonesActiveHighlight();
      UI.updateOddsBadge(null);
      await dealerTurn();
    }
  }

  async function dealerTurn() {
    await delay(300);
    await revealDealerHole();

    const allBusted = state.playerHands.every(h => h.status === 'busted');
    if (!allBusted) {
      let hv = handValue(state.dealerHand);
      while (hv.total < 17) {
        await delay(400);
        const card = drawCard(state.shoe);
        state.dealerHand.push(card);
        UI.dealCard(UI.refs.dealerCardsEl, card, false);
        hv = handValue(state.dealerHand);
        updateDealerDisplay(true);
        await delay(350);
      }
    }
    updateShoeDisplay();
    await delay(300);
    await finishRound();
  }

  async function finishRound() {
    const dealerCards = state.dealerHand;
    const dealerBlackjack = isBlackjack(dealerCards);
    const dealerHv = handValue(dealerCards);
    const dealerBust = dealerHv.total > 21;
    updateDealerDisplay(true);

    let totalNet = 0;
    let totalProfit = 0;
    let anyBlackjackWin = false;
    const summaries = [];

    state.playerHands.forEach(hand => {
      const hv = handValue(hand.cards);
      let net, outcome;
      if (hand.status === 'busted') {
        net = 0; outcome = 'loss';
      } else if (hand.natural) {
        if (dealerBlackjack) { net = hand.bet; outcome = 'push'; }
        else { net = hand.bet + hand.bet * BLACKJACK_PAYOUT; outcome = 'win'; anyBlackjackWin = true; }
      } else if (dealerBlackjack) {
        net = 0; outcome = 'loss';
      } else if (dealerBust || hv.total > dealerHv.total) {
        net = hand.bet * 2; outcome = 'win';
      } else if (hv.total === dealerHv.total) {
        net = hand.bet; outcome = 'push';
      } else {
        net = 0; outcome = 'loss';
      }
      totalNet += net;
      totalProfit += net - hand.bet;
      hand.result = outcome;
      summaries.push({ outcome, profit: net - hand.bet });
      updateHandDisplay(state.playerHands.indexOf(hand));
    });

    state.bankroll += totalNet;
    state.stats.pnl += totalProfit;
    state.stats.rounds++;
    summaries.forEach(s => {
      if (s.outcome === 'win') state.stats.wins++;
      else if (s.outcome === 'loss') state.stats.losses++;
      else state.stats.pushes++;
    });
    if (anyBlackjackWin) state.stats.blackjacks++;

    let bannerOutcome, bannerLabel, payoutText;
    if (summaries.length === 1) {
      const s = summaries[0];
      bannerOutcome = s.outcome;
      bannerLabel = s.outcome === 'win'
        ? (state.playerHands[0].natural ? 'BLACKJACK!' : 'YOU WIN')
        : s.outcome === 'loss' ? 'DEALER WINS' : 'PUSH';
      payoutText = s.outcome === 'push' ? 'Bet returned' : UI.formatMoney(s.profit);
    } else {
      bannerOutcome = totalProfit > 0 ? 'win' : totalProfit < 0 ? 'loss' : 'push';
      bannerLabel = summaries.map((s, i) => `Hand ${i + 1}: ${s.outcome.toUpperCase()}`).join(' · ');
      payoutText = UI.formatMoney(totalProfit) + ' total';
    }

    UI.showResultBanner(bannerOutcome, bannerLabel, payoutText);
    if (totalProfit > 0) sndWin(); else if (totalProfit < 0) sndLose(); else sndPush();
    UI.announce(bannerLabel + '. ' + payoutText);

    const histOutcome = totalProfit > 0 ? 'win' : totalProfit < 0 ? 'loss' : 'push';
    state.history.push({ outcome: histOutcome, label: UI.formatMoney(totalProfit) });

    UI.updateBankroll(state.bankroll);
    UI.updateStats(state.stats);
    UI.renderHistory(state.history);

    state.bet = { amount: 0 };
    UI.updateBetDisplay(state.bet);

    if (state.shoe.length <= CUT_CARD) {
      setTimeout(() => {
        state.shoe = createShoe();
        updateShoeDisplay();
        UI.showToast('♠ Shoe reshuffled ♠');
      }, 2000);
    }

    if (state.bankroll <= 0) {
      setTimeout(() => { UI.refs.overlay.classList.add('show'); }, 1500);
    }

    setTimeout(() => { setPhaseBetting(); }, 1800);
  }

  // ─── PLAYER ACTIONS ───

  async function hit() {
    if (state.phase !== 'playerTurn') return;
    const idx = state.activeHandIndex;
    const hand = state.playerHands[idx];
    if (hand.status !== 'active') return;
    disableActionButtons();

    const card = drawCard(state.shoe);
    hand.cards.push(card);
    UI.dealCard(hand.zone.cardsRow, card, false);
    const hv = handValue(hand.cards);
    if (hv.total > 21) { hand.status = 'busted'; sndBust(); }
    updateHandDisplay(idx);
    updateShoeDisplay();
    await delay(300);
    updateOddsForActiveHand();

    if (hand.status === 'busted') {
      await delay(400);
      await advanceToNextHandOrDealer();
    } else {
      refreshActionButtons();
    }
  }

  async function stand() {
    if (state.phase !== 'playerTurn') return;
    const hand = state.playerHands[state.activeHandIndex];
    if (hand.status !== 'active') return;
    disableActionButtons();
    hand.status = 'stood';
    updateHandDisplay(state.activeHandIndex);
    await advanceToNextHandOrDealer();
  }

  async function double() {
    if (state.phase !== 'playerTurn') return;
    const idx = state.activeHandIndex;
    const hand = state.playerHands[idx];
    if (hand.status !== 'active' || hand.cards.length !== 2 || state.bankroll < hand.bet) return;
    disableActionButtons();

    state.bankroll -= hand.bet;
    hand.bet *= 2;
    UI.updateBankroll(state.bankroll);

    const card = drawCard(state.shoe);
    hand.cards.push(card);
    UI.dealCard(hand.zone.cardsRow, card, false);
    const hv = handValue(hand.cards);
    hand.status = hv.total > 21 ? 'busted' : 'doubled';
    if (hand.status === 'busted') sndBust();
    updateHandDisplay(idx);
    updateShoeDisplay();
    await delay(400);
    updateOddsForActiveHand();
    await delay(300);
    await advanceToNextHandOrDealer();
  }

  async function split() {
    if (state.phase !== 'playerTurn') return;
    const idx = state.activeHandIndex;
    const hand = state.playerHands[idx];
    if (hand.status !== 'active' || hand.cards.length !== 2 || !isPair(hand.cards)) return;
    if (state.splitsUsed >= MAX_SPLITS || state.bankroll < hand.bet) return;
    disableActionButtons();

    state.bankroll -= hand.bet;
    UI.updateBankroll(state.bankroll);
    state.splitsUsed++;

    const secondCard = hand.cards.pop();
    const newHand = createHand(hand.bet);
    newHand.cards.push(secondCard);
    state.playerHands.splice(idx + 1, 0, newHand);

    renderHandZones();
    refreshActionButtons();

    await dealCardToHand(idx, 350);
    await dealCardToHand(idx + 1, 350);
    updateShoeDisplay();
    updateOddsForActiveHand();
    refreshActionButtons();
  }

  // ─── BETTING ───

  function addChip(value) {
    if (state.phase !== 'betting') return;
    if (state.bet.amount + value > state.bankroll) {
      const canAdd = state.bankroll - state.bet.amount;
      if (canAdd >= MIN_BET) state.bet.amount = state.bankroll;
      else { UI.showToast('Insufficient balance'); return; }
    } else {
      state.bet.amount += value;
    }
    sndChip();
    UI.updateBetDisplay(state.bet);
    setPhaseBetting();
    UI.hideResultBanner();
  }

  function clearBet() {
    if (state.phase !== 'betting') return;
    state.bet = { amount: 0 };
    UI.updateBetDisplay(state.bet);
    setPhaseBetting();
  }

  function deal() {
    if (state.phase !== 'betting' || state.bet.amount < MIN_BET) return;
    initAudio();
    state.prevBetAmount = state.bet.amount;
    state.bankroll -= state.bet.amount;
    UI.updateBankroll(state.bankroll);
    dealRound();
  }

  function rebet() {
    if (state.phase !== 'betting' || !state.prevBetAmount) return;
    const amt = Math.min(state.prevBetAmount, state.bankroll);
    if (amt < MIN_BET) { UI.showToast('Insufficient balance to rebet'); return; }
    state.bet = { amount: amt };
    UI.updateBetDisplay(state.bet);
    initAudio();
    state.bankroll -= amt;
    UI.updateBankroll(state.bankroll);
    dealRound();
  }

  function newGame() {
    state.bankroll = START_BANKROLL;
    state.bet = { amount: 0 };
    state.prevBetAmount = null;
    state.history = [];
    state.stats = { wins: 0, losses: 0, pushes: 0, blackjacks: 0, rounds: 0, pnl: 0 };
    state.shoe = createShoe();
    UI.refs.overlay.classList.remove('show');
    UI.clearTable();
    UI.updateBankroll(state.bankroll);
    updateShoeDisplay();
    UI.updateBetDisplay(state.bet);
    UI.updateStats(state.stats);
    UI.renderHistory(state.history);
    UI.updateOddsBadge(null);
    setPhaseBetting();
  }

  function toggleSpeed() {
    state.fastMode = !state.fastMode;
    UI.refs.btnSpeed.textContent = state.fastMode ? '⚡ Fast' : '⚡ Normal';
    document.documentElement.style.setProperty('--anim-speed', state.fastMode ? '2' : '4');
  }

  function init() {
    state.shoe = createShoe();
    UI.updateBankroll(state.bankroll);
    updateShoeDisplay();
    UI.updateStats(state.stats);
    UI.renderHistory(state.history);
    UI.updateOddsBadge(null);
    setPhaseBetting();
  }

  return { init, addChip, clearBet, deal, rebet, hit, stand, double, split, newGame, toggleSpeed, getState: () => state };
})();
