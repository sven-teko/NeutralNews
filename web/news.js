// web/news.js

function makeCard(a){
  const wrap = document.createElement('div');
  wrap.className = 'card p-3 mb-3';

  const h = document.createElement('h5');
  h.className = 'mb-1';
  const link = document.createElement('a');
  link.href = a.url || '#';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = a.title || '';
  h.appendChild(link);
  wrap.appendChild(h);

  const meta = document.createElement('div');
  meta.className = 'd-flex flex-wrap gap-2 align-items-center mb-2';

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = a.source || '';
  meta.appendChild(badge);

  if (Array.isArray(a.tags) && a.tags.length){
    const tag = document.createElement('small');
    tag.className = 'text-secondary';
    tag.textContent = ' ' + a.tags.slice(0,3).join(' · ');
    meta.appendChild(tag);
  }

  if (a.published){
    const small = document.createElement('small');
    small.className = 'text-secondary';
    small.textContent = ' ' + a.published;
    meta.appendChild(small);
  }
  wrap.appendChild(meta);

  if (a.summary){
    const p = document.createElement('p');
    p.className = 'mb-0';
    p.textContent = a.summary;
    wrap.appendChild(p);
  }

  return wrap;
}

function groupBlock(group){
  const block = document.createElement('section');
  block.className = 'mb-4';

  const title = document.createElement('h3');
  title.className = 'mb-3';
  title.textContent = group.topic || 'Thema';
  block.appendChild(title);

  const colwrap = document.createElement('div');
  colwrap.className = 'colwrap';

  const leftCol = document.createElement('div');
  const rightCol = document.createElement('div');

  if (group.left && group.left.length){
    group.left.forEach(a => leftCol.appendChild(makeCard(a)));
  } else {
    leftCol.innerHTML = '<p class="text-secondary">Keine Treffer links.</p>';
  }

  if (group.right && group.right.length){
    group.right.forEach(a => rightCol.appendChild(makeCard(a)));
  } else {
    rightCol.innerHTML = '<p class="text-secondary">Keine Treffer rechts.</p>';
  }

  colwrap.appendChild(leftCol);
  colwrap.appendChild(rightCol);
  block.appendChild(colwrap);

  return block;
}

function qs(obj){
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k,v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  return p.toString();
}

async function loadGroups(){
  const root = document.getElementById('groups');
  root.textContent = 'Lade…';

  const urlParams = new URLSearchParams(location.search);
  const left = urlParams.get('left') || 'srf';
  const right = urlParams.get('right') || 'tagesschau';
  const limit = urlParams.get('limit') || '20';
  const q = urlParams.get('q') || '';
  const thr = urlParams.get('thr') || '';

  const query = qs({ left, right, limit, q, thr });

  try{
    const res = await fetch(`/api/feeds?${query}`, { cache:'no-store' });
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || 'API Fehler');

    let groups = (data.data && data.data.groups) || [];

    // Beidseitige Gruppen herausfiltern
    const bothSides = groups.filter(g => (g.left && g.left.length) && (g.right && g.right.length));

    root.textContent = '';
    if (bothSides.length){
      bothSides.forEach(g => root.appendChild(groupBlock(g)));
      return;
    }

    // Fallback: wenn keine beidseitigen gefunden → alle anzeigen + Hinweis
    const note = document.createElement('div');
    note.className = 'alert alert-secondary';
    note.textContent = 'Hinweis: Keine klaren Paare gefunden – zeige verwandte Einzelthemen.';
    root.appendChild(note);

    if (groups.length === 0){
      root.innerHTML += '<div class="alert alert-secondary mb-0">Keine Treffer.</div>';
      return;
    }

    groups.forEach(g => root.appendChild(groupBlock(g)));

  }catch(e){
    console.error(e);
    root.innerHTML = '<div class="alert alert-danger">Fehler beim Laden der Gruppen.</div>';
  }
}

window.addEventListener('load', loadGroups);
