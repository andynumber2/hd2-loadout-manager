import { api, esc } from './api.js';

const state = {
  gameData: { stratagems: [], primary: [], secondary: [], grenades: [], armor: [], boosters: [] },
  slots: [null, null, null, null],
  modalSlot: null,
  modalCat: 'all',
  loadoutId: null,
  shareId: null,
};

const nameInput    = document.getElementById('loadout-name');
const factionBtns  = document.querySelectorAll('.faction-btn');
const slotEls      = document.querySelectorAll('.slot');
const saveBtn      = document.getElementById('save-btn');
const isPublicCb   = document.getElementById('is-public');
const shareBox     = document.getElementById('share-url-box');
const shareUrlText = document.getElementById('share-url-text');
const copyBtn      = document.getElementById('copy-btn');
const modal        = document.getElementById('modal');
const modalSearch  = document.getElementById('modal-search');
const stratGrid    = document.getElementById('strat-grid');
const catBtns      = document.querySelectorAll('.cat-btn');
const usernameEl   = document.getElementById('nav-username');
const pageTitle    = document.getElementById('page-title');

async function init() {
  const meRes = await api.get('/auth/me');
  if (!meRes) return;
  usernameEl.textContent = (await meRes.json()).username;

  const [stratRes, weapRes, grenRes, armorRes, boostRes] = await Promise.all([
    api.get('/game/stratagems'),
    api.get('/game/weapons'),
    api.get('/game/grenades'),
    api.get('/game/armor'),
    api.get('/game/boosters'),
  ]);
  state.gameData.stratagems = await stratRes.json();
  const weapons = await weapRes.json();
  state.gameData.primary   = weapons.primary;
  state.gameData.secondary = weapons.secondary;
  state.gameData.grenades  = await grenRes.json();
  state.gameData.armor     = await armorRes.json();
  state.gameData.boosters  = await boostRes.json();

  populateSelects();

  const params = new URLSearchParams(window.location.search);
  if (params.has('id')) {
    state.loadoutId = Number(params.get('id'));
    pageTitle.textContent = 'EDIT LOADOUT';
    await loadExisting(state.loadoutId);
  }
}

function populateSelects() {
  fillSelect('primary',   state.gameData.primary,   'Select primary weapon');
  fillSelect('secondary', state.gameData.secondary, 'Select secondary weapon');
  fillSelect('grenade',   state.gameData.grenades,  'Select grenade');
  fillSelect('armor',     state.gameData.armor,     'Select armor');
  fillSelect('booster',   state.gameData.boosters,  'Select booster');
}

function fillSelect(id, items, placeholder) {
  const sel = document.getElementById(id);
  sel.innerHTML = '<option value="">-- ' + esc(placeholder) + ' --</option>' +
    items.map(i => '<option value="' + esc(i.id) + '">' + esc(i.name) + '</option>').join('');
}

async function loadExisting(id) {
  const res  = await api.get('/loadouts/' + id);
  const data = await res.json();
  nameInput.value    = data.name;
  isPublicCb.checked = !!data.is_public;
  state.shareId      = data.share_id;
  setFaction(data.enemy_faction);
  updateShareBox();
  data.stratagems.forEach(s => { state.slots[s.slot - 1] = s; });
  renderSlots();
  if (data.primary_weapon_id)   document.getElementById('primary').value   = data.primary_weapon_id;
  if (data.secondary_weapon_id) document.getElementById('secondary').value = data.secondary_weapon_id;
  if (data.grenade_id)          document.getElementById('grenade').value   = data.grenade_id;
  if (data.armor_id)            document.getElementById('armor').value     = data.armor_id;
  if (data.booster_id)          document.getElementById('booster').value   = data.booster_id;
}

function setFaction(faction) {
  factionBtns.forEach(b => {
    const match = b.dataset.faction === faction;
    b.classList.toggle('active', match);
    b.classList.remove('terminids', 'automatons', 'illuminate');
    if (match) b.classList.add(faction);
  });
}

factionBtns.forEach(b => b.addEventListener('click', () => setFaction(b.dataset.faction)));

function getActiveFaction() {
  return [...factionBtns].find(b => b.classList.contains('active'))?.dataset.faction || null;
}

function renderSlots() {
  slotEls.forEach((el, i) => {
    const s = state.slots[i];
    el.textContent = '';
    el.classList.toggle('filled', !!s);
    if (s) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'slot-clear';
      clearBtn.textContent = 'x';
      clearBtn.dataset.slot = i;
      el.appendChild(clearBtn);
      if (s.image_url) {
        const img = document.createElement('img');
        img.src = s.image_url;
        img.alt = s.name;
        el.appendChild(img);
      }
      const nameEl = document.createElement('span');
      nameEl.className = 'slot-name';
      nameEl.textContent = s.name;
      el.appendChild(nameEl);
    } else {
      const icon = document.createElement('span');
      icon.className = 'slot-empty-icon';
      icon.textContent = '+';
      el.appendChild(icon);
      const lbl = document.createElement('span');
      lbl.className = 'slot-empty-label';
      lbl.textContent = 'SLOT ' + (i + 1);
      el.appendChild(lbl);
    }
  });
}

document.getElementById('strat-slots').addEventListener('click', (e) => {
  const clearBtn = e.target.closest('.slot-clear');
  if (clearBtn) {
    state.slots[Number(clearBtn.dataset.slot)] = null;
    renderSlots();
    return;
  }
  const slot = e.target.closest('.slot');
  if (slot) {
    state.modalSlot = Number(slot.dataset.slot);
    openModal();
  }
});

function openModal() {
  modalSearch.value = '';
  state.modalCat = 'all';
  catBtns.forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
  renderStratGrid();
  modal.classList.add('open');
  modalSearch.focus();
}

document.getElementById('modal-close').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

catBtns.forEach(b => b.addEventListener('click', () => {
  state.modalCat = b.dataset.cat;
  catBtns.forEach(x => x.classList.toggle('active', x === b));
  renderStratGrid();
}));

modalSearch.addEventListener('input', renderStratGrid);

function renderStratGrid() {
  const search  = modalSearch.value.toLowerCase();
  const taken   = new Set(state.slots.filter(Boolean).map(s => s.stratagem_id));
  const visible = state.gameData.stratagems.filter(s => {
    if (taken.has(s.id)) return false;
    if (state.modalCat !== 'all' && s.category !== state.modalCat) return false;
    if (search && !s.name.toLowerCase().includes(search)) return false;
    return true;
  });

  stratGrid.textContent = '';
  if (!visible.length) {
    const p = document.createElement('p');
    p.style.cssText = 'color:var(--muted);font-size:11px;padding:8px;grid-column:1/-1';
    p.textContent = 'No results';
    stratGrid.appendChild(p);
    return;
  }
  visible.forEach(s => {
    const tile = document.createElement('div');
    tile.className = 'strat-tile';
    tile.dataset.id = s.id;
    if (s.image_url) {
      const img = document.createElement('img');
      img.src = s.image_url;
      img.alt = s.name;
      tile.appendChild(img);
    }
    const nameEl = document.createElement('span');
    nameEl.className = 'strat-tile-name';
    nameEl.textContent = s.name;
    tile.appendChild(nameEl);
    stratGrid.appendChild(tile);
  });
}

stratGrid.addEventListener('click', (e) => {
  const tile = e.target.closest('.strat-tile');
  if (!tile) return;
  const id    = Number(tile.dataset.id);
  const strat = state.gameData.stratagems.find(s => s.id === id);
  state.slots[state.modalSlot] = { stratagem_id: strat.id, slot: state.modalSlot + 1, name: strat.name, image_url: strat.image_url };
  renderSlots();
  modal.classList.remove('open');
});

isPublicCb.addEventListener('change', updateShareBox);

function updateShareBox() {
  const show = isPublicCb.checked && state.shareId;
  shareBox.classList.toggle('visible', !!show);
  if (show) shareUrlText.textContent = window.location.origin + '/s/' + state.shareId;
}

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(shareUrlText.textContent);
  copyBtn.textContent = '[ COPIED ]';
  setTimeout(() => { copyBtn.textContent = '[ COPY ]'; }, 2000);
});

saveBtn.addEventListener('click', async () => {
  const name          = nameInput.value.trim();
  const enemy_faction = getActiveFaction();
  if (!name)          { alert('Enter a loadout name.'); return; }
  if (!enemy_faction) { alert('Select a target enemy.'); return; }

  const stratagems = state.slots
    .map((s, i) => s ? { stratagem_id: s.stratagem_id, slot: i + 1 } : null)
    .filter(Boolean);

  const body = {
    name, enemy_faction,
    is_public:           isPublicCb.checked ? 1 : 0,
    stratagems,
    primary_weapon_id:   Number(document.getElementById('primary').value)   || null,
    secondary_weapon_id: Number(document.getElementById('secondary').value) || null,
    grenade_id:          Number(document.getElementById('grenade').value)   || null,
    armor_id:            Number(document.getElementById('armor').value)     || null,
    booster_id:          Number(document.getElementById('booster').value)   || null,
  };

  let res;
  if (state.loadoutId) {
    res = await api.put('/loadouts/' + state.loadoutId, body);
  } else {
    res = await api.post('/loadouts', body);
    if (res && res.ok) {
      const data      = await res.json();
      state.loadoutId = data.id;
      state.shareId   = data.share_id;
      pageTitle.textContent = 'EDIT LOADOUT';
      window.history.replaceState(null, '', '/builder.html?id=' + state.loadoutId);
      updateShareBox();
      return;
    }
  }
  if (res && !res.ok) {
    const err = await res.json();
    alert(err.error || 'Save failed.');
  }
});

init();
