/* Thunder Road Companion — game logic */
'use strict';

(() => {
  // ------------------------------------------------------------------
  // Data
  // ------------------------------------------------------------------
  const TILE_NAMES = {
    '1a': 'Parking Lot',      '1b': 'Runway Ruin',
    '2a': 'Snakeway',         '2b': 'Unrest Stop',
    '3a': 'Mudhole',          '3b': 'Bunker',
    '4a': 'Barrens',          '4b': 'Scenic Route',
    '5a': 'Route Sixty Styx', '5b': 'Choke',
    // Carnage at Devil's Run
    '6a': 'Drifts',           '6b': 'Rumble Strip',
    '7a': 'Salty Dogleg',     '7b': 'Warzone',
    '8a': 'Zag',              '8b': "Serpent's Tongue",
    '9a': 'Scorcher',         '9b': 'Ring of Fire',
    '10a': 'Glass Oasis',     '10b': 'Boneyard',
  };
  const START_TILES = ['1a', '1b'];
  const LAST_BASE_TILE = 5;
  const LAST_EXPANSION_TILE = 10;

  const DICE = {
    road:      { name: 'Road',      faces: ['1', '1', '1', '2', '2', '3'] },
    slam:      { name: 'Slam',      faces: ['Bottom', 'Bottom', 'Bottom', 'Bottom', 'Top', 'Top'] },
    direction: { name: 'Direction', faces: ['Rear Left', 'Rear', 'Rear Right', 'Front Left', 'Front', 'Front Right'] },
    stunt:     { name: 'Stunt',     faces: ['4', '1', '3', '3', '2', '2'] },
    shoot:     { name: 'Shooting',  faces: ['Large', 'Large', 'Large', 'Any', 'Small/Medium', 'Small'] },
    fire:      { name: 'Fire',      faces: ['+1 Moves', '+2 Moves', '+2 Moves', 'Fire Goes Out', 'Fire Goes Out', 'Vehicle Eliminated'] },
  };

  const SHOOT_TEXT = {
    'Large': 'Large vehicle hit',
    'Any': 'Any vehicle hit',
    'Small/Medium': 'Medium or small vehicle hit',
    'Small': 'Small vehicle hit',
  };
  const FIRE_TEXT = {
    '+1 Moves': '+1 moves',
    '+2 Moves': '+2 moves',
    'Fire Goes Out': 'Fire goes out',
    'Vehicle Eliminated': 'Vehicle eliminated',
  };
  const DIR_ANGLE = {
    'Front': 0, 'Front Right': 45, 'Rear Right': 135,
    'Rear': 180, 'Rear Left': 225, 'Front Left': 315,
  };
  const PIP_CELLS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9] };

  const lc = (s) => s.toLowerCase();

  // Situations rolled with a fixed set of dice
  const SITUATIONS = {
    slam:     { title: 'Slam',           dice: ['slam', 'direction'], reroll: true,
                text: ([s, d]) => `${s} car moves ${lc(d)}` },
    slamdir:  { title: 'Slam Direction', dice: ['direction'],
                text: ([d]) => `Vehicle moves ${lc(d)}` },
    shoot:    { title: 'Shoot',          dice: ['shoot'],
                text: ([s]) => SHOOT_TEXT[s] },
    fire:     { title: 'On Fire',        dice: ['fire'],
                text: ([f]) => FIRE_TEXT[f], danger: ([f]) => f === 'Vehicle Eliminated' },
    oil:      { title: 'Oil Slick',      dice: ['direction'],
                text: ([d]) => `Vehicle moves ${lc(d)}` },
    shrapnel: { title: 'Shrapnel',       dice: ['direction'],
                text: ([d]) => `Shrapnel travels ${lc(d)}` },
    blast:    { title: 'Blast Off',      dice: ['stunt', 'direction'],
                text: ([n, d]) => `Vehicle lands ${n} space${n === '1' ? '' : 's'} away to the ${lc(d)}` },
  };

  // ------------------------------------------------------------------
  // Randomness
  // ------------------------------------------------------------------
  function randInt(n) {
    if (window.crypto && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / n) * n; // avoid modulo bias
      let x;
      do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
      return x % n;
    }
    return Math.floor(Math.random() * n);
  }
  const roll = (key) => DICE[key].faces[randInt(DICE[key].faces.length)];
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ------------------------------------------------------------------
  // Road tiles
  // ------------------------------------------------------------------
  const tileNumber = (code) => parseInt(code, 10);
  const oppositeSide = (code) => code.slice(0, -1) + (code.endsWith('a') ? 'b' : 'a');
  const tileLabel = (code) => `${code} ${TILE_NAMES[code]}`;

  function buildDeck(expansion) {
    const last = expansion ? LAST_EXPANSION_TILE : LAST_BASE_TILE;
    const deck = [];
    for (let n = 2; n <= last; n++) deck.push(`${n}${randInt(2) ? 'b' : 'a'}`);
    return shuffle(deck);
  }

  // ------------------------------------------------------------------
  // State + persistence
  // ------------------------------------------------------------------
  const GAME_KEY = 'trv-companion-game-v1';
  const PREFS_KEY = 'trv-companion-prefs-v1';

  function storeGet(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function storeSet(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage unavailable: keep playing in memory */ }
  }

  function validGame(g) {
    return g && g.v === 1 && TILE_NAMES[g.rear] && TILE_NAMES[g.middle] && TILE_NAMES[g.lead] &&
      Array.isArray(g.deck) && g.settings && typeof g.turn === 'number';
  }

  let game = storeGet(GAME_KEY);
  if (!validGame(game)) game = null;
  const save = () => storeSet(GAME_KEY, game);

  // ------------------------------------------------------------------
  // DOM helpers
  // ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const el = {
    setup: $('setup'), game: $('game'),
    optExpansion: $('optExpansion'), optRoadDie: $('optRoadDie'), startBtn: $('startBtn'),
    turnNum: $('turnNum'), roadDieWrap: $('roadDieWrap'), roadDie: $('roadDie'),
    menuBtn: $('menuBtn'), nextTurnBtn: $('nextTurnBtn'), newTileBtn: $('newTileBtn'),
    tiles: { lead: $('tileLead'), middle: $('tileMiddle'), rear: $('tileRear') },
    sheetLayer: $('sheetLayer'), sheetTitle: $('sheetTitle'), diceRow: $('diceRow'),
    resultText: $('resultText'), resultSub: $('resultSub'), rollLog: $('rollLog'),
    sheetActions: $('sheetActions'),
    menuLayer: $('menuLayer'), menuExpansion: $('menuExpansion'), menuRoadDie: $('menuRoadDie'),
    newGameBtn: $('newGameBtn'),
  };

  const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ROLL_MS = reducedMotion ? 120 : 650;
  let busy = false;

  function faceHTML(key, value) {
    if (key === 'road' || key === 'stunt') {
      const on = PIP_CELLS[value] || [];
      let cells = '';
      for (let c = 1; c <= 9; c++) cells += `<i class="${on.includes(c) ? 'on' : ''}"></i>`;
      return `<div class="pips" aria-hidden="true">${cells}</div>`;
    }
    if (key === 'direction') {
      const angle = DIR_ANGLE[value] || 0;
      return `<div class="face-dir" aria-hidden="true">
        <svg viewBox="0 0 40 40" style="transform:rotate(${angle}deg)"><path d="M20 3 L34 19 H25 V37 H15 V19 H6 Z"/></svg>
        <span>${value}</span></div>`;
    }
    let label = value, cls = '';
    if (key === 'slam') { cls = value === 'Bottom' ? 'long' : ''; }
    if (key === 'shoot') {
      label = { 'Large': 'Large', 'Any': 'Any', 'Small/Medium': 'S / M', 'Small': 'Small' }[value];
      cls = label.length > 4 ? 'long' : '';
    }
    if (key === 'fire') {
      label = { '+1 Moves': '+1', '+2 Moves': '+2', 'Fire Goes Out': 'Out', 'Vehicle Eliminated': 'Elim' }[value];
      cls = value === 'Vehicle Eliminated' ? 'long' : '';
    }
    return `<div class="face-text ${cls}" aria-hidden="true">${label}</div>`;
  }

  function setFace(dieEl, key, value) {
    dieEl.innerHTML = faceHTML(key, value);
    dieEl.setAttribute('aria-label', `${DICE[key].name} die: ${value}`);
  }

  // Tumble the given dice through random faces, then land on their final values.
  function animateDice(items, onDone) {
    busy = true;
    items.forEach(({ dieEl }) => {
      dieEl.classList.remove('landed');
      dieEl.classList.add('rolling');
    });
    const tick = setInterval(() => {
      items.forEach(({ dieEl, key }) => setFace(dieEl, key, roll(key)));
    }, 70);
    setTimeout(() => {
      clearInterval(tick);
      items.forEach(({ dieEl, key, value }) => {
        setFace(dieEl, key, value);
        dieEl.classList.remove('rolling');
        void dieEl.offsetWidth; // restart landing animation
        dieEl.classList.add('landed');
      });
      busy = false;
      if (onDone) onDone();
    }, ROLL_MS);
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function showScreen(name) {
    el.setup.hidden = name !== 'setup';
    el.game.hidden = name !== 'game';
    window.scrollTo(0, 0);
  }

  function renderSetup() {
    const prefs = storeGet(PREFS_KEY) || { expansion: false, roadDie: true };
    el.optExpansion.checked = !!prefs.expansion;
    el.optRoadDie.checked = !!prefs.roadDie;
    showScreen('setup');
  }

  function renderTiles(effect) {
    ['lead', 'middle', 'rear'].forEach((pos) => {
      const t = el.tiles[pos];
      const code = game[pos];
      t.querySelector('.code').textContent = code;
      t.querySelector('.name').textContent = TILE_NAMES[code];
      t.setAttribute('aria-label', `${pos} tile: ${tileLabel(code)}`);
      t.classList.remove('fresh', 'shifted');
      if (effect) {
        void t.offsetWidth;
        t.classList.add(pos === 'lead' ? 'fresh' : 'shifted');
      }
    });
  }

  function renderGame() {
    el.turnNum.textContent = game.turn;
    el.roadDieWrap.hidden = !game.settings.roadDie;
    if (game.settings.roadDie && game.roadDie) setFace(el.roadDie, 'road', game.roadDie);
    renderTiles(false);
    showScreen('game');
    renderSheet(false);
  }

  // ------------------------------------------------------------------
  // Result sheet
  // ------------------------------------------------------------------
  function button(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', () => { if (!busy) onClick(); });
    return b;
  }

  // Build the sheet from game.sit. `animateIdx` lists which dice to tumble.
  function renderSheet(animateIdx) {
    const sit = game && game.sit;
    if (!sit) { el.sheetLayer.hidden = true; return; }
    el.sheetLayer.hidden = false;
    el.sheetTitle.textContent = sit.title;

    // dice
    el.diceRow.innerHTML = '';
    const dieEls = sit.dice.map(({ key, value }) => {
      const slot = document.createElement('div');
      slot.className = 'die-slot';
      const d = document.createElement('div');
      d.className = `die die-${key}`;
      setFace(d, key, value);
      const cap = document.createElement('div');
      cap.className = 'die-cap';
      cap.textContent = DICE[key].name;
      slot.append(d, cap);
      el.diceRow.append(slot);
      return d;
    });

    // text
    el.resultText.textContent = sit.text;
    el.resultText.classList.toggle('danger', !!sit.danger);
    el.resultSub.textContent = sit.sub || '';

    // Dazed roll log
    if (sit.type === 'dazed') {
      el.rollLog.hidden = false;
      el.rollLog.innerHTML = '';
      for (let i = 0; i < sit.total; i++) {
        const li = document.createElement('li');
        const r = sit.log[i];
        if (r) {
          li.innerHTML = `<b>${i + 1}</b>${r}`;
          if (i === sit.log.length - 1) li.className = 'latest';
        } else {
          li.innerHTML = `<b>${i + 1}</b>—`;
          li.className = 'waiting';
        }
        el.rollLog.append(li);
      }
    } else {
      el.rollLog.hidden = true;
    }

    // actions
    el.sheetActions.innerHTML = '';
    if (sit.type === 'dazed' && sit.log.length < sit.total) {
      el.sheetActions.append(
        button(`Next Direction Roll · ${sit.log.length + 1} of ${sit.total}`, 'btn-primary', dazedNext),
        button('Clear', 'btn-ghost', clearSit),
      );
    } else {
      if (sit.reroll) el.sheetActions.append(button('Reroll', 'btn-secondary', () => runSituation(sit.type)));
      el.sheetActions.append(button('Clear & Continue', 'btn-primary', clearSit));
    }

    if (animateIdx && animateIdx.length) {
      el.resultText.classList.add('pending');
      el.sheetActions.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const items = animateIdx.map((i) => ({ dieEl: dieEls[i], key: sit.dice[i].key, value: sit.dice[i].value }));
      animateDice(items, () => {
        el.resultText.classList.remove('pending');
        el.sheetActions.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      });
    } else {
      el.resultText.classList.remove('pending');
    }
  }

  function clearSit() {
    game.sit = null;
    save();
    el.sheetLayer.hidden = true;
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  function startGame() {
    const settings = { expansion: el.optExpansion.checked, roadDie: el.optRoadDie.checked };
    storeSet(PREFS_KEY, settings);
    const deck = buildDeck(settings.expansion);
    const rear = START_TILES[randInt(2)];
    const middle = deck.shift();
    const lead = deck.shift();
    game = {
      v: 1, settings, turn: 1,
      roadDie: settings.roadDie ? roll('road') : null,
      rear, middle, lead, deck,
      sit: null,
    };
    save();
    renderGame();
    renderTiles(true);
    if (settings.roadDie) animateDice([{ dieEl: el.roadDie, key: 'road', value: game.roadDie }]);
    keepAwake();
  }

  function nextTurn() {
    game.turn += 1;
    if (game.settings.roadDie) game.roadDie = roll('road');
    save();
    el.turnNum.textContent = game.turn;
    if (game.settings.roadDie) animateDice([{ dieEl: el.roadDie, key: 'road', value: game.roadDie }]);
  }

  function runSituation(type) {
    if (type === 'dazed') return dazedStart();
    const def = SITUATIONS[type];
    const values = def.dice.map(roll);
    game.sit = {
      type, title: def.title, reroll: !!def.reroll,
      dice: def.dice.map((key, i) => ({ key, value: values[i] })),
      text: def.text(values),
      danger: def.danger ? def.danger(values) : false,
    };
    save();
    renderSheet(def.dice.map((_, i) => i));
  }

  function dazedStart() {
    const n = roll('stunt');
    const d = roll('direction');
    game.sit = {
      type: 'dazed', title: 'Dazed',
      dice: [{ key: 'stunt', value: n }, { key: 'direction', value: d }],
      total: parseInt(n, 10), log: [d],
      text: `Vehicle moves ${lc(d)}`,
    };
    dazedSub();
    save();
    renderSheet([0, 1]);
  }

  function dazedNext() {
    const sit = game.sit;
    const d = roll('direction');
    sit.log.push(d);
    sit.dice[1].value = d;
    sit.text = `Vehicle moves ${lc(d)}`;
    dazedSub();
    save();
    renderSheet([1]);
  }

  function dazedSub() {
    const sit = game.sit;
    sit.sub = sit.log.length < sit.total
      ? `Direction roll ${sit.log.length} of ${sit.total}`
      : (sit.total === 1 ? 'Only 1 direction roll' : `All ${sit.total} direction rolls done`);
  }

  function newRoadTile() {
    const old = game.rear;
    let fate;
    if (tileNumber(old) === 1) {
      fate = `${tileLabel(old)} left the road and is out of the game.`;
    } else {
      const opp = oppositeSide(old);
      game.deck.push(opp);
      fate = `${tileLabel(old)} left the road. ${tileLabel(opp)} goes to the bottom of the deck.`;
    }
    game.rear = game.middle;
    game.middle = game.lead;
    const drawn = game.deck.shift();
    if (!drawn) { // should never happen with the recycling rule, but never break the road
      game.lead = game.middle;
      fate += ' The road deck is empty.';
    } else {
      game.lead = drawn;
    }
    game.sit = {
      type: 'newtile', title: 'New Road Tile', dice: [],
      text: `New lead: ${tileLabel(game.lead)}`,
      sub: fate,
    };
    save();
    renderTiles(true);
    renderSheet(false);
  }

  // ------------------------------------------------------------------
  // Menu
  // ------------------------------------------------------------------
  function openMenu() {
    el.menuExpansion.textContent = game.settings.expansion ? 'On' : 'Off';
    el.menuRoadDie.textContent = game.settings.roadDie ? 'On' : 'Off';
    el.menuLayer.hidden = false;
  }
  function closeMenu() { el.menuLayer.hidden = true; }
  function newGame() {
    if (!confirm('Start a new game? The current game will be lost.')) return;
    game = null;
    storeSet(GAME_KEY, null);
    closeMenu();
    renderSetup();
  }

  // ------------------------------------------------------------------
  // Keep the screen awake
  // ------------------------------------------------------------------
  let wakeLock = null;
  async function keepAwake() {
    if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
  document.addEventListener('pointerdown', keepAwake, { passive: true });

  // ------------------------------------------------------------------
  // Wire up
  // ------------------------------------------------------------------
  el.startBtn.addEventListener('click', startGame);
  el.nextTurnBtn.addEventListener('click', () => { if (!busy && !game.sit) nextTurn(); });
  el.newTileBtn.addEventListener('click', () => { if (!busy && !game.sit) newRoadTile(); });
  document.querySelectorAll('.sit').forEach((b) => {
    b.addEventListener('click', () => { if (!busy && !game.sit) runSituation(b.dataset.sit); });
  });
  el.menuBtn.addEventListener('click', openMenu);
  document.querySelectorAll('[data-close-menu]').forEach((b) => b.addEventListener('click', closeMenu));
  el.newGameBtn.addEventListener('click', newGame);

  if (game) renderGame(); else renderSetup();
  keepAwake();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // exposed for automated testing only
  window.__trv = { getGame: () => game, TILE_NAMES };
})();
