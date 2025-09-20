function esc(s){
  return (s || "").toString()
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function makeCard(a){
  const wrap = document.createElement('div');
  wrap.className = 'card p-3 mb-3';

  if (a.image){
    const img = document.createElement('img');
    img.className = 'img-fit mb-2';
    img.alt = '';
    img.src = a.image;
    wrap.appendChild(img);
  }

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
  meta.className = 'd-flex gap-2 align-items-center mb-2';
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = a.source || '';
  meta.appendChild(badge);
  if (a.published){
    const small = document.createElement('small');
    small.className = 'text-secondary';
    small.textContent = ' ' + a.published;
    meta.appendChild(small);
  }
  wrap.appendChild(meta);

  if (a.summary){
    const p = document.createElement('p');
    p.className = 'mb-2';
    p.textContent = a.summary;
    wrap.appendChild(p);
  }

  return wrap;
}

async function loadFeeds(){
  const left = document.getElementById('left');
  const right = document.getElementById('right');
  left.textContent = 'Lade…';
  right.textContent = 'Lade…';

  try{
    const res = await fetch('/api/feeds?srf=top&tag=alle&limit=20', {cache:'no-store'});
    const data = await res.json();
    if(!data.ok) throw new Error('API Fehler');

    const srf = data.data.srf || [];
    const tag = data.data.tagesschau || [];

    left.textContent = '';
    right.textContent = '';

    if (srf.length === 0) left.innerHTML = '<p class="text-secondary">Keine Treffer.</p>';
    if (tag.length === 0) right.innerHTML = '<p class="text-secondary">Keine Treffer.</p>';

    srf.forEach(a => left.appendChild(makeCard(a)));
    tag.forEach(a => right.appendChild(makeCard(a)));
  }catch(e){
    left.innerHTML  = '<div class="alert alert-danger">Fehler beim Laden.</div>';
    right.innerHTML = '<div class="alert alert-danger">Fehler beim Laden.</div>';
    console.error(e);
  }
}

window.addEventListener('load', loadFeeds);
