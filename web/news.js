// /static/news.js — kompakt & funktionsgleich
(() => {
  const LIMIT_DEFAULT = 50, MAX_CACHE = 200;

  // ---- Helpers ----
  const N = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').toLowerCase();
  const toDate = x => { const n=Number(x); const d=(x && !Number.isNaN(n) && String(x).length>=10)?new Date(n):new Date(x||0); return isNaN(d)?new Date(0):d; };
  const cap = o => /^[A-ZÄÖÜ]/.test(o);
  const allcaps = o => !!o && o === o.toUpperCase() && /[A-ZÄÖÜ]/.test(o);
  const fire = (t, detail) => { const e=new CustomEvent(t,{detail,bubbles:true}); document.dispatchEvent(e); try{window.dispatchEvent(new CustomEvent(t,{detail}))}catch{} };
  const onBoth = (t,h) => { window.addEventListener(t,h); document.addEventListener(t,h); };
  const trimHash = u => (u||'').split('#')[0];
  const qs = o => { const p=new URLSearchParams(); for (const[k,v] of Object.entries(o)) if(v!==undefined&&v!==null&&v!=='') p.set(k,String(v)); return p.toString(); };

  // ---- Sprachheuristik ----
  const STOP = new Set([
    'und','oder','aber','den','dem','des','der','die','das','ein','eine','einer','einem','einen',
    'im','in','am','an','auf','mit','von','für','vor','nach','bei','ohne','als','auch','noch',
    'ist','sind','war','waren','wird','werden','hat','haben','aus','zum','zur','über','gegen',
    'heute','gestern','morgen','jetzt','bald','so','darum','deshalb','daher',
    'wir','ihr','sie','er','es','man','uns','euch','ihnen','jemand','niemand','sich',
    'neue','neuer','neues','neuen','neu','aktuell','live','update','innen',
    'was','wer','wem','wen','wessen','wie','wo','wann','warum','wieso','weshalb','wozu',
    'welch','welcher','welche','welches','welchem','welchen','dessen','deren',
    'wenn','weil','dass','falls','sobald','während','obwohl','damit','indem',
    'bevor','nachdem','seit','seitdem','sodass','sowie','ob','doch','nur','dann','da','denn'
  ]);
  const CONJ_START = new Set(['wenn','weil','dass','falls','sobald','während','obwohl','damit','indem','bevor','nachdem','seit','seitdem','sodass','sowie','ob','doch','nur','dann','da','denn']);
  const ACR = new Set(['eu','us','usa','uk','uno','who','nato','uaw','ice','afd','cdu','spd','csu','fbi','cia','bka','dax','ezb','un']);
  const NSUFF = ['ung','keit','heit','tion','tät','schaft','tum','nis','ment','ismus','ist','erin','er','ler','chen','lein'];
  const hasNounSuf = t => NSUFF.some(s => t.endsWith(s));
  const sing = t => t.length>5 && /en|er$/.test(t) ? t.slice(0,-2) : (t.length>4 && t.endsWith('e') ? t.slice(0,-1) : t);
  const dispKw = kw => !kw ? 'Thema' : (ACR.has(kw) ? kw.toUpperCase() : kw[0].toUpperCase()+kw.slice(1));

  function keywords(title, forced){
    if (!title) return new Set();
    const O = String(title).split(/[^A-Za-zÄÖÜäöü0-9\-]+/).filter(Boolean);
    const T = N(title).split(/[^a-z0-9\-]+/).filter(Boolean);
    const out = new Set();
    for (let i=0; i<T.length; i++){            // <- fix: korrektes "<"
      const nTok=T[i], oTok=O[i]||nTok;
      const nParts=nTok.split('-').filter(Boolean), oParts=oTok.split('-').filter(Boolean);
      for (let j=0; j<nParts.length; j++){
        const n=nParts[j], o=oParts[j]||n;
        if (!n || STOP.has(n) || /^\d+$/.test(n)) continue;
        const okLen = n.length>=3 || ACR.has(n);
        if (okLen && allcaps(o)) { out.add(sing(n)); continue; }
        if (i>0 && okLen && cap(o)) { out.add(sing(n)); continue; }
        if (i===0 && okLen){
          if (hasNounSuf(n) || allcaps(o)) { out.add(sing(n)); continue; }
          if (cap(o) && !CONJ_START.has(n)) { out.add(sing(n)); continue; }
        }
        if (n.endsWith('ieren') && n.length>=8) { out.add(sing(n)); continue; }
      }
    }
    return forced && forced.size ? new Set([...out].filter(k=>forced.has(k))) : out;
  }

  // ---- Mapping/Cache ----
  const mapArt = a => a ? ({ title:a.title||'', url:a.url||'#', summary:a.summary||a.description||'', date:a.published||a.date||a.datetime||'' }) : null;
  let CACHE = [], LOADING = false;
  const pid = p => `${(p.keyword||'').toLowerCase()}||${trimHash(p.srf?.url)}||${trimHash(p.tagesschau?.url)}`;
  function merge(pairs){
    const m = new Map(CACHE.map(p=>[pid(p),p]));
    pairs.forEach(p=>m.set(pid(p),p));
    CACHE = [...m.values()].sort((A,B)=>{
      const a = Math.max(+toDate(A.srf?.date), +toDate(A.tagesschau?.date));
      const b = Math.max(+toDate(B.srf?.date), +toDate(B.tagesschau?.date));
      return b-a;
    });
    if (CACHE.length>MAX_CACHE) CACHE.length = MAX_CACHE;
  }
  const sliceUI = lim => CACHE.slice(0, (Number.isFinite(lim)&&lim>0)?lim:LIMIT_DEFAULT);

  // ---- Load ----
  async function load(){
    if (LOADING) return; LOADING = true;
    const root = document.getElementById('groups'); if (root && !root.dataset.nnBusy) root.dataset.nnBusy='1';

    const p = new URLSearchParams(location.search);
    const left  = (p.get('left')||'srf').toLowerCase();
    const right = (p.get('right')||'tagesschau').toLowerCase();
    const limit = parseInt(p.get('limit')||`${LIMIT_DEFAULT}`,10);
    const q     = p.get('q')||'';
    const thr   = p.get('thr')||'';
    const forced = new Set(((p.get('kw')||p.get('keywords')||'').split(',').map(s=>s.trim()).filter(Boolean)).map(N));

    try{
      const res = await fetch(`/api/feeds?${qs({left,right,limit,q,thr})}`, { cache:'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error||'API Fehler');

      const groups = (json.data && json.data.groups) || [];
      const all = groups.flatMap(g => (g.left||[])).concat(groups.flatMap(g => (g.right||[])));

      const isSRF = a => { const s=(a.source||a.publisher||'').toLowerCase(); return s==='srf'||s.includes('sr')||/schweizer radio|fernsehen/.test(s); };
      const isTS  = a => { const s=(a.source||a.publisher||'').toLowerCase(); return s.includes('tagesschau'); };

      const srf = all.filter(isSRF), ts = all.filter(isTS);
      const srfBy = new Map(), tsBy = new Map();
      const put = (map, art, kws) => {
        const d = toDate(art.published||art.date||art.datetime);
        kws.forEach(k => { const prev = map.get(k); if (!prev || toDate(prev.published||prev.date||prev.datetime) < d) map.set(k, art); });
      };
      srf.forEach(a => put(srfBy, a, keywords(a.title, forced)));
      ts.forEach(a  => put(tsBy,  a, keywords(a.title, forced)));

      const shared = [...srfBy.keys()].filter(k => tsBy.has(k));
      const pairs = shared.map(k => ({
        keyword: dispKw(k),
        srf: mapArt(srfBy.get(k)),
        tagesschau: mapArt(tsBy.get(k)),
        topic: 'alle'
      }));

      merge(pairs);
      const list = sliceUI(limit);

      if (!list.length){
        if (root){ root.innerHTML = '<div class="alert alert-secondary mb-0">Keine passenden Paare.</div>'; delete root.dataset.nnBusy; }
        fire('nn:data', { groups: [] }); LOADING=false; return;
      }

      window.NN_GROUPS = list;
      fire('nn:data', { groups: list });
      if (root){ root.textContent=''; delete root.dataset.nnBusy; }
    }catch(e){
      console.error('[news.js] load error:', e);
      const root = document.getElementById('groups');
      if (root){ root.innerHTML = '<div class="alert alert-danger">Fehler beim Laden.</div>'; delete root.dataset.nnBusy; }
      fire('nn:data', { groups: sliceUI(LIMIT_DEFAULT) });
    }finally{
      LOADING = false;
    }
  }

  // ---- Public Hooks ----
  const handleRequest = () => {
    const limit = parseInt(new URLSearchParams(location.search).get('limit')||`${LIMIT_DEFAULT}`,10);
    const list = sliceUI(limit);
    list.length ? fire('nn:data', { groups:list }) : load();
  };
  onBoth('nn:request-data', handleRequest);
  onBoth('nn:refresh-data', () => load());

  // Start
  load();
})();
