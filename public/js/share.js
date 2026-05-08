const shareId   = window.location.pathname.split('/').pop();
const container = document.getElementById('share-container');
const notFound  = document.getElementById('not-found');

async function init() {
  const res = await fetch(`/api/share/${shareId}`);
  if (!res.ok) {
    container.style.display = 'none';
    notFound.style.display  = 'block';
    return;
  }
  const d = await res.json();

  document.title = `${d.name} — HD2 Loadout`;
  document.getElementById('loadout-name').textContent  = d.name;
  document.getElementById('loadout-owner').textContent = `by ${d.owner}`;

  const factionEl       = document.getElementById('faction-tag');
  factionEl.textContent = d.enemy_faction.toUpperCase();
  factionEl.className   = `faction-tag ${d.enemy_faction}`;

  renderSlots(d.stratagems);
  renderGear(d);
}

function renderSlots(stratagems) {
  const container = document.getElementById('share-slots');
  container.textContent = '';
  if (!stratagems.length) {
    const p = document.createElement('span');
    p.style.cssText = 'color:var(--muted);font-size:11px';
    p.textContent = 'No stratagems selected';
    container.appendChild(p);
    return;
  }
  stratagems.forEach(s => {
    const div = document.createElement('div');
    div.className = 'share-slot';
    if (s.image_url) {
      const img = document.createElement('img');
      img.src = s.image_url;
      img.alt = s.name;
      div.appendChild(img);
    }
    const nameEl = document.createElement('span');
    nameEl.className = 'share-slot-name';
    nameEl.textContent = s.name;
    div.appendChild(nameEl);
    container.appendChild(div);
  });
}

function renderGear(d) {
  const container = document.getElementById('share-gear');
  container.textContent = '';
  const items = [
    { name: d.primary_weapon_name,   img: d.primary_weapon_image },
    { name: d.secondary_weapon_name, img: d.secondary_weapon_image },
    { name: d.grenade_name,          img: d.grenade_image },
    { name: d.armor_name,            img: d.armor_image },
    { name: d.booster_name,          img: d.booster_image },
  ].filter(g => g.name);

  items.forEach(g => {
    const div = document.createElement('div');
    div.className = 'share-gear-item';
    if (g.img) {
      const img = document.createElement('img');
      img.src = g.img;
      img.alt = g.name;
      div.appendChild(img);
    }
    const nameEl = document.createElement('span');
    nameEl.className = 'share-gear-name';
    nameEl.textContent = g.name;
    div.appendChild(nameEl);
    container.appendChild(div);
  });
}

init();
