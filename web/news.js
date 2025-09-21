// /static/news.js
function qs(obj){
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k,v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  return p.toString();
}

function toDate(x){
  if (!x) return new Date(0);
  // Versuche ISO / Timestamp / locale-ish
  const n = Number(x);
  if (!Number.isNaN(n) && String(x).length >= 10) return new Date(n);
  const d = new Date(x);
  return isNaN(d) ? new Date(0) : d;
}

// Normalisieren & Tokenisieren für Keyword-Abgleich
const STOP = new Set([
  'und','oder','aber','den','dem','des','der','die','das','ein','eine','einer','einem','einen',
  'im','in','am','an','auf','mit','von','für','vor','nach','bei','ohne','als','auch','noch',
  'ist','sind','war','waren','wird','werden','hat','haben','aus','zum','zur','über','gegen',
  'heute','gestern','morgen','neue','neuer','neues','neuen','update','live'
]);
const ALLOW_2 = new Set(['eu','us','uk','un','uaw','ice','afd']); // kurze Akronyme whitelisten

function normalize(s){
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Diacritics weg
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

function titleKeywords(title, forced=undefined){
  if (!title) return new Set();
  const raw = normalize(String(title));
  // Split auf Nicht-Buchstaben/Ziffern, '-' bleibt als Worttrenner erhalten
  let toks = raw.split(/[^a-z0-9\-]+/).filter(Boolean);

  // Hyphen-Teile zusätzlich berücksichtigen (z.B. „gaza-krieg“ -> „gaza“, „krieg“)
  const extra = [];
  toks.forEach(t => { if (t.includes('-')) extra.push(...t.split('-').filter(Boolean)); });
  toks = toks.concat(extra);

  const out = new Set();
  toks.forEach(t => {
    if (STOP.has(t)) return;
    if (/^\d+$/.test(t)) return;
    if (t.length >= 3 || ALLOW_2.has(t)) out.add(t);
  });

  // Falls Keywords vorgegeben (?kw=...), nur diese zulassen
  if (forced && forced.size) {
    return new Set([...out].filter(k => forced.has(k)));
  }
  return out;
}

function mapArticle(a){
  if (!a) return null;
  return {
    title: a.title || '',
    url: a.url || '#',
    summary: a.summary || '',
    date: a.published || a.date || ''
  };
}

function displayNameForKeyword(kw){
  // Schön darstellen: EU/USA etc groß, sonst Kapitalisierung
  if (kw.length <= 3) return kw.toUpperCase();
  return kw.charAt(0).toUpperCase() + kw.slice(1);
}

async function loadPairs(){
  const root = document.getElementById('groups');
  if (root) root.textContent = 'Lade…';

  const urlParams = new URLSearchParams(location.search);
  const left = (urlParams.get('left') || 'srf').toLowerCase();
  const right = (urlParams.get('right') || 'tagesschau').toLowerCase();
  const limit = parseInt(urlParams.get('limit') || '20', 10);
  const q = urlParams.get('q') || '';
  const thr = urlParams.get('thr') || '';

  // Optional: Stichworte vorgeben (?kw=gaza,rentner)
  const kwParam = (urlParams.get('kw') || urlParams.get('keywords') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const forcedKw = new Set(kwParam.map(k => normalize(k)));

  const query = qs({ left, right, limit, q, thr });

  try{
    const res = await fetch(`/api/feeds?${query}`, { cache:'no-store' });
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || 'API Fehler');

    const groups = (data.data && data.data.groups) || [];

    // Alle Artikel je Quelle einsammeln (gruppenunabhängig)
    const allLeft = groups.flatMap(g => Array.isArray(g.left) ? g.left : []);
    const allRight = groups.flatMap(g => Array.isArray(g.right) ? g.right : []);

    // Quelle-Filter robuster (tagesschau vs. srf)
    const isSRF = a => ((a.source || '').toLowerCase() === 'srf');
    const isTS  = a => ((a.source || '').toLowerCase().includes('tagesschau'));

    const srfArticles = allLeft.concat(allRight).filter(isSRF);
    const tsArticles  = allLeft.concat(allRight).filter(isTS);

    // Pro Keyword jeweils den aktuellsten Artikel merken
    const srfByKw = new Map();
    const tsByKw  = new Map();

    function consider(map, art, kws){
      const d = toDate(art.published || art.date);
      kws.forEach(k => {
        const prev = map.get(k);
        if (!prev || toDate(prev.published || prev.date) < d) map.set(k, art);
      });
    }

    srfArticles.forEach(a => {
      const kws = titleKeywords(a.title, forcedKw);
      consider(srfByKw, a, kws);
    });
    tsArticles.forEach(a => {
      const kws = titleKeywords(a.title, forcedKw);
      consider(tsByKw, a, kws);
    });

    // Schnittmenge der Keywords: Nur wenn BEIDE Quellen den Begriff in der Headline haben
    const shared = [];
    for (const kw of srfByKw.keys()){
      if (tsByKw.has(kw)) shared.push(kw);
    }

    // Paare bauen (1 SRF : 1 Tagesschau) – jeweils die aktuellsten pro Keyword
    let pairs = shared.map(kw => {
      const srf = srfByKw.get(kw);
      const ts  = tsByKw.get(kw);
      return {
        keyword: displayNameForKeyword(kw),
        srf: mapArticle(srf),
        tagesschau: mapArticle(ts)
      };
    });

    // Sortieren nach Frische (max Datum der beiden)
    pairs.sort((A,B) => {
      const dA = Math.max(+toDate(A.srf?.date), +toDate(A.tagesschau?.date));
      const dB = Math.max(+toDate(B.srf?.date), +toDate(B.tagesschau?.date));
      return dB - dA;
    });

    // Begrenzen (limit bezieht sich jetzt auf Anzahl der Paare)
    if (Number.isFinite(limit) && limit > 0) {
      pairs = pairs.slice(0, limit);
    }

    if (!pairs.length){
      if (root) root.innerHTML = '<div class="alert alert-secondary mb-0">Keine passenden Paare: Es gibt keinen gemeinsamen Titel-Begriff (z. B. „Gaza“) in beiden Quellen.</div>';
      return;
    }

    // An die neue index.html übergeben (die zeigt keyword über den beiden Artikeln)
    window.dispatchEvent(new CustomEvent('nn:data', { detail: { groups: pairs } }));
    if (root) root.textContent = '';

  }catch(err){
    console.error(err);
    if (root) root.innerHTML = '<div class="alert alert-danger">Fehler beim Laden der Gruppen.</div>';
  }
}

window.addEventListener('load', loadPairs);
