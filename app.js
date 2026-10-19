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
    // Ignition (half length; 11–14 are curved: side a curves right, side b curves left)
    '11a': 'Highway 24',      '11b': 'Highway 42',
    '12a': 'Highway 45',      '12b': 'Highway 54',
    '13a': 'Highway 36',      '13b': 'Highway 63',
    '14a': 'Highway 28',      '14b': 'Highway 82',
    '15a': 'Highway 10',      '15b': 'Highway 1',
    '16a': 'Highway 71',      '16b': 'Highway 17',
    '17a': 'Highway 75',      '17b': 'Highway 57',
    '18a': 'Highway 95',      '18b': 'Highway 59',
  };
  const START_TILES = ['1a', '1b'];
  const TILE_SETS = {
    base:      [2, 5],
    expansion: [6, 10],   // Carnage at Devil's Run
    ignition:  [11, 18],
  };
  const ROAD_LENGTH = 3;        // keep the road at least this long
  const CURVED = { 11: true, 12: true, 13: true, 14: true };
  const CURVE_WORD = { R: 'right', L: 'left' };

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

  // Stats screen: which dice to list, and the order of their face types
  const STATS_DICE = ['road', 'slam', 'direction', 'stunt', 'shoot', 'fire'];
  const STAT_FACES = {
    road:      [['1', '1'], ['2', '2'], ['3', '3']],
    slam:      [['Top', 'Top'], ['Bottom', 'Bottom']],
    direction: [['Front Left', 'Front Left'], ['Front', 'Front'], ['Front Right', 'Front Right'],
                ['Rear Left', 'Rear Left'], ['Rear', 'Rear'], ['Rear Right', 'Rear Right']],
    stunt:     [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']],
    shoot:     [['Large', 'Large'], ['Any', 'Any'], ['Small/Medium', 'Small / Medium'], ['Small', 'Small']],
    fire:      [['+1 Moves', '+1 Moves'], ['+2 Moves', '+2 Moves'], ['Fire Goes Out', 'Fire Goes Out'],
                ['Vehicle Eliminated', 'Vehicle Eliminated']],
  };

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
    quake:    { title: 'Quake',          dice: ['direction'],
                text: ([d]) => `All vehicles move ${lc(d)}` },
    ramp:     { title: 'Ramp',           dice: ['stunt'],
                text: ([n]) => `Vehicle lands ${n} space${n === '1' ? '' : 's'} to the front` },
  };

  // While a Dazed is paused, only these may be resolved…
  const ALLOWED_DURING_DAZED = new Set(['slam', 'slamdir', 'shoot', 'oil', 'quake', 'ramp']);
  // …and these end the Dazed once resolved.
  const ENDS_DAZED = new Set(['slam', 'slamdir', 'ramp']);

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
  // roll() is used for the tumbling animation and is never counted.
  const roll = (key) => DICE[key].faces[randInt(DICE[key].faces.length)];
  // rollDie() is a real roll: it is recorded in this game's stats.
  function rollDie(key) {
    const value = roll(key);
    if (game) {
      if (!game.stats) game.stats = {};
      const tally = game.stats[key] || (game.stats[key] = {});
      tally[value] = (tally[value] || 0) + 1;
    }
    return value;
  }
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
  const tileLength = (code) => (tileNumber(code) >= TILE_SETS.ignition[0] ? 0.5 : 1);
  const curveOf = (code) => (CURVED[tileNumber(code)] ? (code.endsWith('a') ? 'R' : 'L') : null);
  const roadLength = () => game.road.reduce((sum, c) => sum + tileLength(c), 0);

  function buildDeck(settings) {
    const deck = [];
    ['base', 'expansion', 'ignition'].forEach((set) => {
      if (set !== 'base' && !settings[set]) return;
      const [first, last] = TILE_SETS[set];
      for (let n = first; n <= last; n++) deck.push(`${n}${randInt(2) ? 'b' : 'a'}`);
    });
    return shuffle(deck);
  }

  // Draw onto the lead end of the road, keeping curves alternating.
  // If the top tile would bend the same way as the last curve placed, it stays
  // on top and the next tile that isn't a same-direction curve is drawn instead.
  // Only if no curve of the needed direction is left in the deck is the top
  // tile turned to its other side. (Holding instead of flipping matters: the
  // road + deck cycle in a fixed order, so always flipping would freeze every
  // curved tile on one side for the whole game.)
  function drawTile() {
    const deck = game.deck;
    if (!deck.length) return null;
    const last = game.lastCurve;
    let idx = 0;
    let flipped = false;
    if (last && curveOf(deck[0]) === last) {
      const need = last === 'R' ? 'L' : 'R';
      if (deck.some((c) => curveOf(c) === need)) {
        idx = deck.findIndex((c) => curveOf(c) !== last);
      } else {
        deck[0] = oppositeSide(deck[0]);
        flipped = true;
      }
    }
    const code = deck.splice(idx, 1)[0];
    if (curveOf(code)) game.lastCurve = curveOf(code);
    game.road.push(code);
    return { code, flipped };
  }

  // Draw until the road is at least ROAD_LENGTH long.
  function fillRoad() {
    const added = [];
    while (roadLength() < ROAD_LENGTH) {
      const t = drawTile();
      if (!t) break;
      added.push(t);
    }
    return added;
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

  // Games saved before Ignition stored rear/middle/lead; convert them.
  function migrate(g) {
    if (g && g.v === 1 && TILE_NAMES[g.rear] && TILE_NAMES[g.middle] && TILE_NAMES[g.lead]) {
      g.road = [g.rear, g.middle, g.lead];
      delete g.rear; delete g.middle; delete g.lead;
      g.settings.ignition = false;
      g.lastCurve = null;
      g.v = 2;
    }
    return g;
  }
  function validGame(g) {
    return g && g.v === 2 && Array.isArray(g.road) && g.road.length > 0 &&
      g.road.every((c) => TILE_NAMES[c]) && Array.isArray(g.deck) && g.settings &&
      typeof g.turn === 'number';
  }

  let game = migrate(storeGet(GAME_KEY));
  if (!validGame(game)) game = null;
  const save = () => storeSet(GAME_KEY, game);

  // ------------------------------------------------------------------
  // DOM helpers
  // ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const el = {
    setup: $('setup'), game: $('game'),
    optExpansion: $('optExpansion'), optIgnition: $('optIgnition'), optRoadDie: $('optRoadDie'), startBtn: $('startBtn'),
    turnNum: $('turnNum'), roadDieWrap: $('roadDieWrap'), roadDie: $('roadDie'),
    menuBtn: $('menuBtn'), nextTurnBtn: $('nextTurnBtn'), newTileBtn: $('newTileBtn'),
    roadTiles: $('roadTiles'),
    sheetLayer: $('sheetLayer'), sheetTitle: $('sheetTitle'), diceRow: $('diceRow'),
    resultText: $('resultText'), resultSub: $('resultSub'), resultAlert: $('resultAlert'), rollLog: $('rollLog'),
    sheetActions: $('sheetActions'),
    menuLayer: $('menuLayer'), menuExpansion: $('menuExpansion'), menuIgnition: $('menuIgnition'), menuRoadDie: $('menuRoadDie'),
    newGameBtn: $('newGameBtn'),
    stats: $('stats'), statsList: $('statsList'), statsSub: $('statsSub'),
    statsBar: $('statsBar'), statsBtn: $('statsBtn'), statsBackBtn: $('statsBackBtn'),
    rollLabel: $('rollLabel'), dazedStrip: $('dazedStrip'), dazedProgress: $('dazedProgress'),
    dazedResumeBtn: $('dazedResumeBtn'), dazedEndBtn: $('dazedEndBtn'),
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
    el.stats.hidden = name !== 'stats';
    el.statsBar.hidden = name !== 'game';
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------
  // Die stats screen
  // ------------------------------------------------------------------
  function faceShare(key, face) {
    const faces = DICE[key].faces;
    return faces.filter((f) => f === face).length / faces.length;
  }

  function renderStats() {
    const stats = game.stats || {};
    el.statsSub.textContent = `This game · Turn ${game.turn}`;
    el.statsList.innerHTML = '';

    STATS_DICE.forEach((key) => {
      if (key === 'road' && !game.settings.roadDie) return;
      const tally = stats[key] || {};
      const total = Object.values(tally).reduce((a, b) => a + b, 0);
      const rows = STAT_FACES[key].map(([face, label]) => {
        const actual = tally[face] || 0;
        const expected = total * faceShare(key, face);
        return { label, actual, expected, sides: Math.round(faceShare(key, face) * 6) };
      });
      const scale = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.expected)));

      const card = document.createElement('section');
      card.className = `stat-card stat-${key}`;
      card.innerHTML = `
        <header class="stat-head">
          <span class="swatch die-${key}" aria-hidden="true"></span>
          <h2>${DICE[key].name} die</h2>
          <span class="stat-total">${total} roll${total === 1 ? '' : 's'}</span>
        </header>
        <div class="stat-cols" aria-hidden="true"><span>Side</span><span>Rolled</span><span>Expected</span></div>
        ${rows.map((r) => `
          <div class="stat-row">
            <span class="stat-face">${r.label}<small>${r.sides} of 6</small></span>
            <span class="stat-act">${r.actual}</span>
            <span class="stat-exp">${r.expected.toFixed(2)}</span>
            <div class="stat-bar" aria-hidden="true">
              <i class="fill" style="width:${(r.actual / scale) * 100}%"></i>
              ${total ? `<i class="mark" style="left:${(r.expected / scale) * 100}%"></i>` : ''}
            </div>
          </div>`).join('')}`;
      el.statsList.append(card);
    });
  }

  function openStats() { renderStats(); showScreen('stats'); }
  function closeStats() { showScreen('game'); }

  function renderSetup() {
    const prefs = storeGet(PREFS_KEY) || { expansion: false, ignition: false, roadDie: true };
    el.optExpansion.checked = !!prefs.expansion;
    el.optIgnition.checked = !!prefs.ignition;
    el.optRoadDie.checked = !!prefs.roadDie;
    showScreen('setup');
  }

  const CURVE_ICON = {
    R: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V13a6 6 0 0 1 6-6h6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M15 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    L: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 21V13a6 6 0 0 0-6-6H6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M9 3 5 7l4 4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // Draw the road with the lead tile at the top. `freshCount` = tiles just added.
  function renderTiles(freshCount) {
    const road = game.road;
    const last = road.length - 1;
    el.roadTiles.innerHTML = '';
    for (let i = last; i >= 0; i--) {
      const code = road[i];
      const pos = i === last ? 'Lead' : i === 0 ? 'Rear' : 'Middle';
      const curve = curveOf(code);
      const t = document.createElement('div');
      t.className = `tile${tileLength(code) < 1 ? ' half' : ''}${i === last ? ' is-lead' : ''}${i === 0 ? ' is-rear' : ''}`;
      t.innerHTML = `<span class="pos">${pos}</span><span class="code">${code}</span>` +
        `<span class="name">${TILE_NAMES[code]}</span>` +
        (curve ? `<span class="curve">${CURVE_ICON[curve]}Curves ${CURVE_WORD[curve]}</span>` : '');
      t.setAttribute('aria-label', `${pos} tile: ${tileLabel(code)}${curve ? `, curves ${CURVE_WORD[curve]}` : ''}`);
      if (freshCount) t.classList.add(i > last - freshCount ? 'fresh' : 'shifted');
      el.roadTiles.append(t);
    }
  }

  function renderGame() {
    el.turnNum.textContent = game.turn;
    el.roadDieWrap.hidden = !game.settings.roadDie;
    if (game.settings.roadDie && game.roadDie) setFace(el.roadDie, 'road', game.roadDie);
    renderTiles(0);
    showScreen('game');
    updateControls();
    renderSheet(false);
  }

  // Enable/disable buttons and show the paused-Dazed strip.
  function updateControls() {
    const dz = game.dazed;
    el.dazedStrip.hidden = !dz;
    el.rollLabel.hidden = !!dz;
    if (dz) el.dazedProgress.textContent = `${dz.log.length} of ${dz.total} moves rolled`;
    el.nextTurnBtn.disabled = !!dz;
    document.querySelectorAll('.sit').forEach((b) => {
      b.disabled = !!dz && !ALLOWED_DURING_DAZED.has(b.dataset.sit);
    });
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
    el.resultAlert.hidden = !sit.alert;
    el.resultAlert.textContent = sit.alert || '';

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
        } else if (sit.cancelled) {
          li.innerHTML = `<b>${i + 1}</b>Cancelled`;
          li.className = 'cancelled';
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
    if (sit.type === 'dazed' && dazedHasMoves(sit)) {
      const split = document.createElement('div');
      split.className = 'split';
      split.append(
        button('Toxic Goo / Mine', 'btn-small btn-outline-danger', () => dazedCancel('Toxic Goo / Mine')),
        button('Vehicle Eliminated', 'btn-small btn-outline-danger', () => dazedCancel('Vehicle eliminated')),
      );
      el.sheetActions.append(
        button(`Next Direction Roll · ${sit.log.length + 1} of ${sit.total}`, 'btn-primary', dazedNext),
        button('Pause · Resolve Others', 'btn-secondary', dazedPause),
        split,
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
    updateControls();
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  function startGame() {
    const settings = {
      expansion: el.optExpansion.checked,
      ignition: el.optIgnition.checked,
      roadDie: el.optRoadDie.checked,
    };
    storeSet(PREFS_KEY, settings);
    game = {
      v: 2, settings, turn: 1,
      roadDie: null,
      road: [START_TILES[randInt(2)]],
      deck: buildDeck(settings),
      lastCurve: null,
      sit: null,
      stats: {},
    };
    fillRoad();
    if (settings.roadDie) game.roadDie = rollDie('road');
    save();
    renderGame();
    renderTiles(game.road.length);
    if (settings.roadDie) animateDice([{ dieEl: el.roadDie, key: 'road', value: game.roadDie }]);
    keepAwake();
  }

  function nextTurn() {
    game.turn += 1;
    if (game.settings.roadDie) game.roadDie = rollDie('road');
    save();
    el.turnNum.textContent = game.turn;
    if (game.settings.roadDie) animateDice([{ dieEl: el.roadDie, key: 'road', value: game.roadDie }]);
  }

  function runSituation(type) {
    if (type === 'dazed') return dazedStart();
    if (game.dazed && !ALLOWED_DURING_DAZED.has(type)) return;
    const def = SITUATIONS[type];
    // Slam / Slam Direction / Ramp end a paused Dazed (a Slam reroll keeps the note).
    const endsDazed = (!!game.dazed && ENDS_DAZED.has(type)) ||
      (!!game.sit && game.sit.type === type && game.sit.endedDazed);
    if (endsDazed) game.dazed = null;
    const values = def.dice.map((key) => rollDie(key));
    game.sit = {
      type, title: def.title, reroll: !!def.reroll,
      dice: def.dice.map((key, i) => ({ key, value: values[i] })),
      text: def.text(values),
      danger: def.danger ? def.danger(values) : false,
      endedDazed: endsDazed,
      sub: endsDazed ? 'Remaining Dazed moves cancelled' : '',
    };
    save();
    updateControls();
    renderSheet(def.dice.map((_, i) => i));
  }

  function dazedStart() {
    const n = rollDie('stunt');
    const d = rollDie('direction');
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
    const d = rollDie('direction');
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

  const dazedHasMoves = (dz) => !dz.cancelled && dz.log.length < dz.total;

  // Close the sheet but keep the Dazed waiting in the paused slot.
  function dazedPause() {
    game.dazed = game.sit;
    game.sit = null;
    save();
    el.sheetLayer.hidden = true;
    updateControls();
  }

  function dazedResume() {
    if (busy || game.sit || !game.dazed) return;
    game.sit = game.dazed;
    game.dazed = null;
    save();
    updateControls();
    renderSheet(false);
  }

  // Toxic Goo / Mine / Vehicle Eliminated: cancel any remaining moves.
  function dazedCancel(reason) {
    const sit = game.sit;
    sit.cancelled = true;
    sit.sub = `${reason} · remaining Dazed moves cancelled`;
    save();
    renderSheet(false);
  }

  // The × on the paused strip.
  function dazedEnd() {
    if (busy || game.sit || !game.dazed) return;
    if (!confirm('End this Dazed? Its remaining moves will be cancelled.')) return;
    game.dazed = null;
    save();
    updateControls();
  }

  // Remove the rear tile: its other side goes to the bottom of the deck,
  // except the start tiles (1a/1b), which leave the game.
  function removeRear() {
    const old = game.road.shift();
    if (tileNumber(old) === 1) return { old, back: null };
    const back = oppositeSide(old);
    game.deck.push(back);
    return { old, back };
  }

  // New Road Tile: remove the rear tile, draw at least one tile, keep drawing
  // until the road is ROAD_LENGTH or more, then remove further rear tiles while
  // the road would still be ROAD_LENGTH or more without them.
  function newRoadTile() {
    const removed = [removeRear()];
    const added = [];
    const first = drawTile();
    if (first) added.push(first);
    added.push(...fillRoad());
    while (game.road.length > 1 && roadLength() - tileLength(game.road[0]) >= ROAD_LENGTH) {
      removed.push(removeRear());
    }

    const lead = added[added.length - 1];
    const lines = [];
    if (added.length > 1) {
      lines.push(`Also added behind it: ${added.slice(0, -1).map((a) => tileLabel(a.code)).join(', ')}`);
    }
    added.forEach((a) => {
      const c = curveOf(a.code);
      if (c) {
        lines.push(`${tileLabel(a.code)} curves ${CURVE_WORD[c]}` +
          (a.flipped ? ' (turned to its other side so curves alternate)' : ''));
      }
    });
    const alert = removed.length > 1
      ? `Remove ${removed.length} tiles from the rear: ${removed.map((r) => tileLabel(r.old)).join(' and ')}`
      : '';
    removed.forEach(({ old, back }) => {
      lines.push(back
        ? `${tileLabel(old)} left the road. ${tileLabel(back)} goes to the bottom of the deck.`
        : `${tileLabel(old)} left the road and is out of the game.`);
    });
    game.sit = {
      type: 'newtile', title: 'New Road Tile', dice: [],
      text: lead ? `New lead: ${tileLabel(lead.code)}` : 'The road deck is empty',
      sub: lines.join('\n'),
      alert,
    };
    save();
    renderTiles(added.length);
    renderSheet(false);
  }

  // ------------------------------------------------------------------
  // Menu
  // ------------------------------------------------------------------
  function openMenu() {
    el.menuExpansion.textContent = game.settings.expansion ? 'On' : 'Off';
    el.menuIgnition.textContent = game.settings.ignition ? 'On' : 'Off';
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
  el.nextTurnBtn.addEventListener('click', () => { if (!busy && !game.sit && !game.dazed) nextTurn(); });
  el.newTileBtn.addEventListener('click', () => { if (!busy && !game.sit) newRoadTile(); });
  document.querySelectorAll('.sit').forEach((b) => {
    b.addEventListener('click', () => { if (!busy && !game.sit) runSituation(b.dataset.sit); });
  });
  el.menuBtn.addEventListener('click', openMenu);
  document.querySelectorAll('[data-close-menu]').forEach((b) => b.addEventListener('click', closeMenu));
  el.newGameBtn.addEventListener('click', newGame);
  el.statsBtn.addEventListener('click', () => { if (!busy && !game.sit) openStats(); });
  el.statsBackBtn.addEventListener('click', closeStats);
  el.dazedResumeBtn.addEventListener('click', dazedResume);
  el.dazedEndBtn.addEventListener('click', dazedEnd);

  if (game) renderGame(); else renderSetup();
  keepAwake();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // exposed for automated testing only
  window.__trv = { getGame: () => game, TILE_NAMES };
})();
