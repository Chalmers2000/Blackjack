/* ======================================================================
   UI — all DOM rendering and lookups. Exposes a single global `UI` object.
   ====================================================================== */

const UI = (() => {
  const $ = id => document.getElementById(id);

  const refs = {
    bankrollEl: $('bankrollDisplay'),
    shoeEl: $('shoeDisplay'),
    dealerCardsEl: $('dealerCards'),
    dealerTotalEl: $('dealerTotal'),
    playerHandsRowEl: $('playerHandsRow'),
    resultBanner: $('resultBanner'),
    resultText: $('resultText'),
    resultPayout: $('resultPayout'),
    betDisplay: $('betDisplay'),
    btnDeal: $('btnDeal'),
    btnClear: $('btnClear'),
    btnRebet: $('btnRebet'),
    playerActionRow: $('playerActionRow'),
    btnHit: $('btnHit'),
    btnStand: $('btnStand'),
    btnDouble: $('btnDouble'),
    btnSplit: $('btnSplit'),
    historyTable: $('historyTable'),
    statW: $('statW'),
    statL: $('statL'),
    statP: $('statP'),
    statBJ: $('statBJ'),
    statR: $('statR'),
    statPnl: $('statPnl'),
    overlay: $('gameOverOverlay'),
    toastEl: $('toast'),
    ariaLive: $('ariaLive'),
    btnSpeed: $('btnSpeed'),
    oddsVal: $('oddsVal'),
    chips: document.querySelectorAll('.chip'),
  };

  function formatMoney(n) {
    return (n < 0 ? '-' : n > 0 ? '+' : '') + '$' + Math.abs(n).toLocaleString();
  }
  function formatBankroll(n) {
    return '$' + n.toLocaleString();
  }

  function buildCardInner(card) {
    const sym = SUIT_SYM[card.suit];
    return `<div class="corner top">${card.rank}<br>${sym}</div>` +
      `<div class="card-center"><div class="card-rank">${card.rank}</div><div class="card-suit">${sym}</div></div>` +
      `<div class="corner bottom">${card.rank}<br>${sym}</div>`;
  }

  // Creates and appends a card element. If faceDown, renders a card back
  // with no markup (the actual card is supplied later to revealCard()).
  // `silent` skips the deal animation/sound — used when redrawing cards that
  // were already dealt earlier (e.g. rebuilding hand-zones after a split).
  function dealCard(container, card, faceDown, silent) {
    const el = document.createElement('div');
    if (faceDown) {
      el.className = 'card back';
      el.setAttribute('aria-label', 'face-down card');
    } else {
      const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
      el.className = 'card ' + (isRed ? 'red' : 'black');
      el.innerHTML = buildCardInner(card);
      el.setAttribute('aria-label', card.rank + ' of ' + card.suit);
    }
    if (silent) {
      el.style.animation = 'none';
      el.style.opacity = '1';
      el.style.transform = 'none';
    } else {
      sndCard();
    }
    container.appendChild(el);
    return el;
  }

  function revealCard(el, card) {
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    el.className = 'card flip-in ' + (isRed ? 'red' : 'black');
    el.innerHTML = buildCardInner(card);
    el.setAttribute('aria-label', card.rank + ' of ' + card.suit);
  }

  function updateBankroll(n) { refs.bankrollEl.textContent = formatBankroll(n); }
  function updateShoe(n) { refs.shoeEl.textContent = 'Shoe: ' + n; }

  function updateBetDisplay(bet) {
    refs.betDisplay.innerHTML = bet.amount === 0
      ? 'Place your bet'
      : `Bet: <strong>${formatBankroll(bet.amount)}</strong>`;
  }

  function updateStats(stats) {
    refs.statW.textContent = stats.wins;
    refs.statL.textContent = stats.losses;
    refs.statP.textContent = stats.pushes;
    refs.statBJ.textContent = stats.blackjacks;
    refs.statR.textContent = stats.rounds;
    refs.statPnl.textContent = formatMoney(stats.pnl);
    refs.statPnl.className = 'stat-val' + (stats.pnl > 0 ? ' pos' : stats.pnl < 0 ? ' neg' : '');
  }

  function renderHistory(history) {
    const table = refs.historyTable;
    const row = table.rows[0];
    while (row.cells.length > 1) row.deleteCell(1);

    const recent = history.slice(-15);
    const total = Math.max(recent.length, 15);

    for (let i = 0; i < total; i++) {
      const cell = row.insertCell();
      cell.className = 'score-cell';
      if (i < recent.length) {
        const h = recent[i];
        cell.textContent = h.label;
        cell.classList.add('result-' + h.outcome); // win | loss | push
        if (i === recent.length - 1) cell.classList.add('latest');
      }
    }
    const wrap = table.closest('.history-table-wrap');
    if (wrap) wrap.scrollLeft = wrap.scrollWidth;
  }

  function clearTable() {
    refs.dealerCardsEl.innerHTML = '';
    refs.dealerTotalEl.textContent = '';
    refs.dealerTotalEl.classList.remove('natural', 'busted');
    refs.playerHandsRowEl.innerHTML = '';
    refs.resultBanner.classList.remove('show', 'win-banner', 'loss-banner', 'push-banner');
  }

  function setDealerTotal(total, { natural = false, busted = false } = {}) {
    refs.dealerTotalEl.textContent = total;
    refs.dealerTotalEl.classList.toggle('natural', natural);
    refs.dealerTotalEl.classList.toggle('busted', busted);
  }

  // Creates one player hand-zone (label + cards row + total + status line),
  // appends it to the row, and returns refs for incremental updates.
  function createHandZone(labelText, isActive) {
    const zoneDiv = document.createElement('div');
    zoneDiv.className = 'hand-zone player-zone' + (isActive ? ' active' : '');
    const label = document.createElement('div');
    label.className = 'hand-label player-label';
    label.textContent = labelText;
    const cardsRow = document.createElement('div');
    cardsRow.className = 'cards-row';
    const totalEl = document.createElement('div');
    totalEl.className = 'hand-total';
    const statusEl = document.createElement('div');
    statusEl.className = 'hand-status';

    zoneDiv.appendChild(label);
    zoneDiv.appendChild(cardsRow);
    zoneDiv.appendChild(totalEl);
    zoneDiv.appendChild(statusEl);
    refs.playerHandsRowEl.appendChild(zoneDiv);

    return { zoneDiv, cardsRow, totalEl, statusEl };
  }

  function setActiveZone(zoneDiv, isActive) {
    zoneDiv.classList.toggle('active', isActive);
  }

  function updateHandTotal(totalEl, total, { natural = false, busted = false } = {}) {
    totalEl.textContent = total;
    totalEl.classList.toggle('natural', natural);
    totalEl.classList.toggle('busted', busted);
  }

  function updateHandStatus(statusEl, text) {
    statusEl.textContent = text;
  }

  function updateOddsBadge(pct) {
    refs.oddsVal.textContent = pct === null ? '—' : Math.round(pct * 100) + '%';
  }

  function showToast(msg, dur = 2000) {
    refs.toastEl.textContent = msg;
    refs.toastEl.classList.add('show');
    setTimeout(() => refs.toastEl.classList.remove('show'), dur);
  }

  function setBettingControlsEnabled(enabled) {
    refs.chips.forEach(b => b.disabled = !enabled);
  }

  function showResultBanner(outcome, label, payoutText) {
    const cls = outcome === 'win' ? 'win-banner' : outcome === 'loss' ? 'loss-banner' : 'push-banner';
    refs.resultBanner.className = 'result-banner ' + cls;
    refs.resultText.textContent = label;
    refs.resultPayout.textContent = payoutText;
    setTimeout(() => refs.resultBanner.classList.add('show'), 50);
  }
  function hideResultBanner() {
    refs.resultBanner.classList.remove('show');
  }

  function announce(msg) { refs.ariaLive.textContent = msg; }

  return {
    $, refs, formatMoney, formatBankroll,
    dealCard, revealCard, updateBankroll, updateShoe, updateBetDisplay,
    updateStats, renderHistory, clearTable, setDealerTotal,
    createHandZone, setActiveZone, updateHandTotal, updateHandStatus,
    updateOddsBadge, showToast, setBettingControlsEnabled, showResultBanner,
    hideResultBanner, announce,
  };
})();
