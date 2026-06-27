/* ======================================================================
   MAIN — event wiring, keyboard shortcuts, init
   ====================================================================== */

document.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => BJ.addChip(parseInt(btn.dataset.chip, 10)));
});

UI.refs.btnClear.addEventListener('click', () => BJ.clearBet());
UI.refs.btnDeal.addEventListener('click', () => BJ.deal());
UI.refs.btnRebet.addEventListener('click', () => BJ.rebet());

UI.refs.btnHit.addEventListener('click', () => BJ.hit());
UI.refs.btnStand.addEventListener('click', () => BJ.stand());
UI.refs.btnDouble.addEventListener('click', () => BJ.double());
UI.refs.btnSplit.addEventListener('click', () => BJ.split());

UI.$('btnNewGame').addEventListener('click', () => BJ.newGame());
UI.refs.btnSpeed.addEventListener('click', () => BJ.toggleSpeed());

// Rules panel toggle (mobile)
const rulesPanel = UI.$('rulesPanel');
const rulesToggle = UI.$('rulesToggle');
const rulesClose = UI.$('rulesClose');
rulesToggle.addEventListener('click', () => rulesPanel.classList.add('open'));
rulesClose.addEventListener('click', () => rulesPanel.classList.remove('open'));

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  const state = BJ.getState();
  if (state.phase === 'betting') {
    if (key === 'd') UI.refs.btnDeal.click();
    else if (key === 'c') UI.refs.btnClear.click();
    else if (key === 'r') UI.refs.btnRebet.click();
  } else if (state.phase === 'playerTurn') {
    if (key === 'h') UI.refs.btnHit.click();
    else if (key === 's') UI.refs.btnStand.click();
    else if (key === '2') UI.refs.btnDouble.click();
    else if (key === 'p') UI.refs.btnSplit.click();
  }
});

BJ.init();
