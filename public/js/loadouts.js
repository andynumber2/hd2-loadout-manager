import { api, esc } from './api.js';

const listEl     = document.getElementById('loadout-list');
const usernameEl = document.getElementById('nav-username');
const logoutBtn  = document.getElementById('logout-btn');

async function init() {
  const meRes = await api.get('/auth/me');
  if (!meRes || !meRes.ok) { window.location.href = '/'; return; }
  usernameEl.textContent = (await meRes.json()).username;

  const res  = await api.get('/loadouts');
  const list = await res.json();
  render(list);
}

function render(loadouts) {
  if (!loadouts.length) {
    listEl.textContent = '';
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'NO LOADOUTS ON FILE. DEPLOY A NEW ONE.';
    listEl.appendChild(p);
    return;
  }
  listEl.innerHTML = loadouts.map(l => `
    <div class="loadout-card">
      <div class="loadout-info">
        <div class="loadout-name">${esc(l.name)}</div>
        <div class="loadout-meta">
          <span class="faction-tag ${esc(l.enemy_faction)}">${esc(l.enemy_faction.toUpperCase())}</span>
          ${l.is_public ? '<span class="public-badge">PUBLIC</span>' : ''}
          ${l.is_public ? `<span class="share-link">/s/${esc(l.share_id)}</span>` : ''}
        </div>
      </div>
      <div class="loadout-actions">
        <button class="btn" data-edit="${l.id}">EDIT</button>
        <button class="btn btn-danger" data-delete="${l.id}">DELETE</button>
      </div>
    </div>`).join('');
}

listEl.addEventListener('click', async (e) => {
  const editBtn   = e.target.closest('[data-edit]');
  const deleteBtn = e.target.closest('[data-delete]');
  if (editBtn) {
    window.location.href = `/builder?id=${editBtn.dataset.edit}`;
  } else if (deleteBtn) {
    if (!confirm('Delete this loadout?')) return;
    await api.delete(`/loadouts/${deleteBtn.dataset.delete}`);
    init();
  }
});

logoutBtn.addEventListener('click', async () => {
  await api.post('/auth/logout');
  window.location.href = '/';
});

init();
