// /static/news.js — Stichwort nur aus Nomen / sinntragenden Begriffen
function qs(obj){
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k,v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  return p.toString();
}
function toDate(x){
  if (!x) return new Date(0);
  const n = Number(x);
  if (!Number.isNaN(n) && String(x).length >= 10) return new Date(n);
  const d = new Date(x);
  return isNaN(d) ? new Date(0) : d;
}

/* ---------- Keyword-Logik: NUR sinnvolle Begriffe ---------- */
// Häufige Nicht-Nomen/Pronomen/Fragewörter etc. (alles lowercase, nach Normalisierung)
const STOP = new Set([
  // Artikel/Pronomen/Partikeln
  'und','oder','aber','den','dem','des','der','die','das','ein','eine','einer','einem','einen',
  'im','in','am','an','auf','mit','von','für','vor','nach','bei','ohne','als','auch','noch',
  'ist','sind','war','waren','wird','werden','hat','haben','aus','zum','zur','über','gegen',
  'heute','gestern','morgen','jetzt','bald','so','darum','deshalb','daher',
  'wir','ihr','sie','er','es','man','uns','euch','ihnen','jemand','niemand','sich',
  'neue','neuer','neues','neuen','neu','aktuell','live','update',
  'innen', // z. B. aus „Rentner:innen“
  // Fragewörter & Relativa – NIE als Stichwort
  'was','wer','wem','wen','wessen',
  'wie','wo','wann','warum','wieso','weshalb','wozu',
  'welch','welcher','welche','welches','welchem','welchen','dessen','deren'
]);
// Akro-Whitelist (<=3 Zeichen)
const ACR = new Set(['eu','us','usa','uk','uno','who','nato','uaw','ice','afd','cdu','spd','csu','fbi','cia','bka','dax','ezb','un']);
// Nomen-Endungen (Heuristik)
const NOUN_SUFFIX = ['ung','keit','heit','tion','tät','schaft','tum','nis','ment','ismus','ist','erin','er','ler','chen','lein'];

function normalize(s){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g,'ss').toLowerCase();
}
function isAllCaps(orig){ return !!orig && orig === orig.toUpperCase() && /[A-ZÄÖÜ]/.test(orig); }
function isCapitalized(orig){ return /^[A-ZÄÖÜ]/.test(orig); }
function hasNounSuffix(tok){ return NOUN_SUFFIX.some(suf => tok.endsWith(suf)); }
// konservative Singularisierung (kein -s, damit „Hamas“ bleibt)
function singularize(tok){
  if (tok.length > 5 && tok.endsWith('en')) return tok.slice(0,-2);
  if (tok.length > 5 && tok.endsWith('er')) return tok.slice(0,-2);
  if (tok.length > 4 && tok.endsWith('e'))  return tok.slice(0,-1);
  return tok;
}

/**
 * Extrahiert sinntragende Stichworte:
 *  - Nomen/Eigennamen (Großschreibung ab Wort 2; am Wortanfang nur falls nicht STOP)
 *  - Akronyme (EU/USA/WHO…)
 *  - nominalisierte/inhaltsschwere -ieren-Wörter nur, wenn BEIDE Seiten sie haben
 */
function nounKeywordsFromTitle(title, forced=undefined){
  if (!title) return new Set();

  const original = String(title);
  const raw = normalize(original);
  const origTokens = original.split(/[^A-Za-zÄÖÜäöü0-9\-]+/).filter(Boolean);
  const normTokens = raw.split(/[^a-z0-9\-]+/).filter(Boolean);

  const out = new Set();

  for (let i = 0; i < normTokens.length; i++){
    let nTok = normTokens[i];
    let oTok = origTokens[i] || nTok;

    const nParts = nTok.includes('-') ? nTok.split('-').filter(Boolean) : [nTok];
    const oParts = oTok.includes('-') ? oTok.split('-').filter(Boolean) : [oTok];

    for (let j = 0; j < nParts.length; j++){
      const n = nParts[j];
      const o = oParts[j] || n;

      if (!n || STOP.has(n)) continue;
      if (/^\d+$/.test(n)) continue;

      const lenOK = n.length >= 3 || ACR.has(n);

      // Akronyme (EU/USA/WHO…)
      if (lenOK && isAllCaps(o)) { out.add(singularize(n)); continue; }

      // Ab Wort 2: Großschreibung => sehr wahrscheinlich Nomen/Eigenname
      if (i > 0 && isCapitalized(o) && lenOK) { out.add(singularize(n)); continue; }

      // Wortanfang: nur wenn NICHT Stop + (Nomen-Endung ODER Großschreibung)
      if (i === 0 && !STOP.has(n) && lenOK && (hasNounSuffix(n) || isCapitalized(o))) {
        out.add(singularize(n)); continue;
      }

      // Spezialfall: gehaltvolle -ieren-Wörter (z. B. „fotografieren“)
      if (n.endsWith('ieren') && n.length >= 8) { out.add(singularize(n)); continue; }
    }
  }

  if (forced && forced.size) return new Set([...out].filter(k => forced.has(k)));
  return out;
}

function mapArticle(a){
  if (!a) return null;
  return { title: a.title || '', url: a.url || '#', summary: a.summary || '', date: a.published || a.date || '' };
}
function displayNameForKeyword(kw){ if (!kw) return 'Thema'; if (ACR.has(kw)) return kw.toUpperCase(); return kw.charAt(0).toUpperCase()+kw.slice(1); }

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
  const kwParam = (urlParams.get('kw') || urlParams.get('keywords') || '').split(',').map(s=>s.trim()).filter(Boolean);
  const forcedKw = new Set(kwParam.map(k => normalize(k)));

  const query = qs({ left, right, limit, q, thr });

  try{
    const res = await fetch(`/api/feeds?${query}`, { cache:'no-store' });
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || 'API Fehler');

    const groups = (data.data && data.data.groups) || [];
    const allLeft  = groups.flatMap(g => Array.isArray(g.left)  ? g.left  : []);
    const allRight = groups.flatMap(g => Array.isArray(g.right) ? g.right : []);

    const isSRF = a => ((a.source || '').toLowerCase() === 'srf');
    const isTS  = a => ((a.source || '').toLowerCase().includes('tagesschau'));

    const srfArticles = allLeft.concat(allRight).filter(isSRF);
    const tsArticles  = allLeft.concat(allRight).filter(isTS);

    // Keyword -> aktuellster Artikel je Quelle
    const srfByKw = new Map();
    const tsByKw  = new Map();
    function consider(map, art, kws){
      const d = toDate(art.published || art.date);
      kws.forEach(k => {
        const prev = map.get(k);
        if (!prev || toDate(prev.published || prev.date) < d) map.set(k, art);
      });
    }
    srfArticles.forEach(a => consider(srfByKw, a, nounKeywordsFromTitle(a.title, forcedKw)));
    tsArticles.forEach(a => consider(tsByKw,  a, nounKeywordsFromTitle(a.title, forcedKw)));

    // Schnittmenge echter Stichworte
    const shared = [];
    for (const kw of srfByKw.keys()) if (tsByKw.has(kw)) shared.push(kw);

    // Paare bauen
    let pairs = shared.map(kw => ({
      keyword: displayNameForKeyword(kw),
      srf: mapArticle(srfByKw.get(kw)),
      tagesschau: mapArticle(tsByKw.get(kw))
    }));

    // Sortieren nach Aktualität
    pairs.sort((A,B) => {
      const dA = Math.max(+toDate(A.srf?.date), +toDate(A.tagesschau?.date));
      const dB = Math.max(+toDate(B.srf?.date), +toDate(B.tagesschau?.date));
      return dB - dA;
    });

    if (Number.isFinite(limit) && limit > 0) pairs = pairs.slice(0, limit);

    if (!pairs.length){
      if (root) root.innerHTML = '<div class="alert alert-secondary mb-0">Keine passenden Paare: Kein gemeinsames **Stichwort** (z. B. „Gaza“, „Alzheimer“, „Essen“, „Fotografieren“) in beiden Headlines.</div>';
      return;
    }

    // An index.html übergeben
    window.dispatchEvent(new CustomEvent('nn:data', { detail: { groups: pairs } }));
    if (root) root.textContent = '';

  }catch(err){
    console.error(err);
    if (root) root.innerHTML = '<div class="alert alert-danger">Fehler beim Laden der Gruppen.</div>';
  }
}

window.addEventListener('load', loadPairs);
