
from __future__ import annotations
from typing import Dict, List, Any, Set, Tuple
import re
import unicodedata
from collections import Counter
from datetime import datetime

# Wortschätze

STOPWORDS = {
    # deusch
    "der","die","das","und","oder","nicht","mit","von","im","in","am","an","auf","für","aus",
    "den","dem","des","ein","eine","einer","eines","einem","einen","zu","zum","zur","über",
    "noch","sich","so","als","bei","nach","vor","bis","wir","ihr","sie","er","es","man",
    "auch","mehr","weniger","gegen","weil","dass","da","beim","ohne",
    "wird","werden","hat","haben","sei","sind","war","waren","kann","können","müssen","muss",
    "soll","sollen","sollte","sollten","immer","heute","morgen","gestern",
    # englisch
    "the","a","an","and","or","of","to","in","on","for","by","with","from","as","at","is","are",
    "be","was","were","this","that","these","those","it","its","into","about","over","under",
    "more","new","must","should","can","could","would","today","yesterday","tomorrow"
}

# generische Wörter
WEAK_TOKENS = {
    "regierung","bund","amt","behörde","beamte","behörden","menschen","leute",
    "jahr","jahre","kommentar","bericht","berichte","video","fotos","bilder",
    "streit","kritik","skandal","schutz","schützen","branche","unternehmen",
    "regel","regeln","arbeit","arbeiten","arbeitsmarkt","probleme","problem",
    "wohnung","wohnungen","restaurant","restaurants","thema","themen","news",
    "forschung","wissenschaft","studie","studien","medizin","gesundheit",
    "verspricht","hilfe","hilft","neuartig","angebot","blick","hintergrund","bericht"
}

# generische Tags
WEAK_TAGS = {
    "politik","wirtschaft","kultur","sport","wissen","wissenschaft","gesundheit",
    "inland","ausland","panorama","welt","schweiz","deutschland","meinung","analyse",
    "news","nachrichten"
}

# Kernthemen
ANCHOR_TOKENS = {
    # Länder
    "ukraine","russland","usa","vereinigte-staaten","kalifornien",
    "israel","gaza","westjordanland","palästina","nato","uno","vereinte-nationen",
    "eu","europa","frankreich","spanien","italien","polen","iran","irak","syrien","china",
    "brüssel","berlin","bern","new-york","großbritannien","vereinigtes-koenigreich","uk",
    # Gesundheitsthemen
    "alzheimer","demenz","depression","postpartum","krebs","covid","corona","grippe"
}

# Kontextwörter
CONTEXT_TOKENS = {
    # Krieg/Konflikte
    "krieg","invasion","front","offensive","angriff","angriffe","rakete","drohne","militär",
    "waffe","waffen","panzer","soldat","soldaten","gefecht","bombardierung",
    "geisel","geiseln","terror","hamas","hisbollah",
    # Politik
    "wahl","wahlen","regierung","parlament","gesetz","gesetze","visa","visum","diplomatie",
    "sanktion","sanktionen","resolution","gerichtsentscheid","urteil",
    # Gesundheit
    "medikament","therapie","impfung","klinisch","neuro","diagnose","frühstadium","symptom","symptome"
}

WORD_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+", re.UNICODE)

# Schwellwerte
BASE_THR = 0.12         
REQUIRE_STRONG_MIN = 2  
NEAR_DATE_DAYS = 10  

#  Synonyme

CANON_MAP = {
    # UN
    "un":"uno", "uno":"uno",
    "vereinte":"vereinte-nationen", "vereinten":"vereinte-nationen",
    "vereinte-nationen":"vereinte-nationen", "vereinten-nationen":"vereinte-nationen",
    "united":"uno", "nations":"vereinte-nationen", "nation":"vereinte-nationen",

    # USA
    "usa":"usa","us":"usa","u.s.":"usa",
    "vereinigte":"vereinigte-staaten","staaten":"vereinigte-staaten",
    "vereinigte-staaten":"vereinigte-staaten",

    # Gaza
    "gaza":"gaza", "gazastreifen":"gaza",
    "westjordanland":"westjordanland","cisjordanien":"westjordanland","west-bank":"westjordanland",

    # Städte
    "new":"new-york","york":"new-york","new-york":"new-york",

    # Europa
    "eu":"eu","europa":"europa",

    # UK
    "uk":"uk",
    "vereinigtes":"vereinigtes-koenigreich","koenigreich":"vereinigtes-koenigreich","königreich":"vereinigtes-koenigreich",
    "vereinigtes-koenigreich":"vereinigtes-koenigreich",
    "grossbritannien":"großbritannien","großbritannien":"großbritannien","great":"großbritannien","britain":"großbritannien",

    # Länder/Orte
    "deutschland":"deutschland","österreich":"österreich","schweiz":"schweiz","frankreich":"frankreich",
    "spanien":"spanien","italien":"italien","polen":"polen","china":"china","russland":"russland",
    "ukraine":"ukraine","israel":"israel","iran":"iran","irak":"irak","syrien":"syrien","palästina":"palästina",
    "brüssel":"brüssel","berlin":"berlin","bern":"bern","kalifornien":"kalifornien","nato":"nato",

    # Gesundheit
    "alzheimer":"alzheimer","demenz":"demenz","depression":"depression",
    "postpartum":"postpartum","postpartal":"postpartum",
}

def _norm_text(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("ß", "ss").lower()
    s = re.sub(r"[–—−‐-]", "-", s)
    return s

def _light_stem(w: str) -> str:
    if len(w) <= 4:
        return w
    for suf in ("en","ern","er","em","e","n","s","es"):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            return w[: -len(suf)]
    return w

def _canon_token(w: str) -> str:
    w = _norm_text(w)
    w = _light_stem(w)
    return CANON_MAP.get(w, w)

def _canon_set(words: Set[str]) -> Set[str]:
    return { _canon_token(w) for w in words }

# Tokenisierung

def _tokens(*parts: str) -> Set[str]:
    bag: Set[str] = set()
    for p in parts:
        text = _norm_text(p or "")
        for w in WORD_RE.findall(text):
            if len(w) > 2 and w not in STOPWORDS:
                bag.add(w)
    return bag

def _strong_tokens(tokens: Set[str]) -> Set[str]:
    return {t for t in tokens if t not in WEAK_TOKENS}

def _tagset(item: Dict[str, Any]) -> Set[str]:
    tags = item.get("tags") or []
    raw = set()
    for t in tags:
        t = _norm_text(str(t))
        for w in WORD_RE.findall(t):
            if len(w) > 2 and w not in STOPWORDS and w not in WEAK_TAGS:
                raw.add(w)
    return _canon_set(raw)

def _jaccard_recall(a: Set[str], b: Set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    denom = min(len(a), len(b))
    return inter / (denom + 0.001)

def _item_tokens(item: Dict[str, Any]) -> Tuple[Set[str], Set[str]]:
    tokens = _tokens(item.get("title",""), item.get("summary",""))
    strong = _strong_tokens(tokens)
    return _canon_set(tokens), _canon_set(strong)  # (canon_all, canon_strong)

#  Datum

def _parse_date(s: str) -> datetime | None:
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M")
    except Exception:
        return None

def _date_penalty(a: Dict[str,Any], b: Dict[str,Any]) -> float:
    da = _parse_date(a.get("published","") or "")
    db = _parse_date(b.get("published","") or "")
    if not da or not db:
        return 0.0
    delta = abs((da - db).days)
    if delta <= NEAR_DATE_DAYS:
        return 0.0
    return min(0.08, 0.01 * (delta - NEAR_DATE_DAYS))

#  Topic-Label

def _topic_label(left_items: List[Dict[str, Any]], right_items: List[Dict[str, Any]]) -> str:
    # gemeinsame Tags
    tag_counter = Counter()
    orig = []
    for it in left_items + right_items:
        for t in (it.get("tags") or []):
            if t and _canon_token(t) not in WEAK_TAGS:
                orig.append(t)
        tag_counter.update(_tagset(it))
    common = [t for t,c in tag_counter.most_common(5) if c > 1]
    if common:
        nice = []
        for key in common[:2]:
            cands = [t for t in orig if _canon_token(t) == key]
            nice.append(cands[0] if cands else key)
        return " / ".join(nice)

    # Fallback
    items = (left_items or []) + (right_items or [])
    if items:
        items_sorted = sorted(items, key=lambda it: (len(it.get("title","")), -len(it.get("summary",""))))
        t = (items_sorted[0].get("title") or "").strip()
        if t:
            return t
    return "Thema"

# Ähnlichkeit

def _similarity(li: Dict[str,Any], rj: Dict[str,Any], tag_bonus: float) -> Tuple[float, bool]:
    can_l, can_strong_l = li["can_all"], li["can_strong"]
    can_r, can_strong_r = rj["can_all"], rj["can_strong"]

    strong_overlap = can_strong_l & can_strong_r
    all_overlap = can_l & can_r

    anchors_l = can_strong_l & ANCHOR_TOKENS
    anchors_r = can_strong_r & ANCHOR_TOKENS
    anchor_overlap = anchors_l & anchors_r

    # Tokens
    base = _jaccard_recall(can_strong_l, can_strong_r)
    tags_overlap = bool(li["tags"] & rj["tags"])
    score = base + (tag_bonus if tags_overlap else 0.0)
    score = max(0.0, score - _date_penalty(li["item"], rj["item"]))

    #  Gate
    gate_ok = (
        tags_overlap or
        (len(strong_overlap) >= REQUIRE_STRONG_MIN) or
        (len(anchor_overlap) >= 1 and (len((all_overlap - anchor_overlap)) >= 1 or len(strong_overlap - anchor_overlap) >= 2))
    )

    return score, gate_ok

#  Hauptlogik

def match_pairs(
    left: List[Dict[str, Any]],
    right: List[Dict[str, Any]],
    *,
    jaccard_threshold: float = BASE_THR,
    tag_bonus: float = 0.35,
) -> List[Dict[str, Any]]:
    L = []
    for i, it in enumerate(left):
        ca, cs = _item_tokens(it)
        L.append({"idx": i, "item": it, "tags": _tagset(it), "can_all": ca, "can_strong": cs})

    R = []
    for j, it in enumerate(right):
        ca, cs = _item_tokens(it)
        R.append({"idx": j, "item": it, "tags": _tagset(it), "can_all": ca, "can_strong": cs})

    used_right = set()
    groups: List[Dict[str, Any]] = []
    unmatched_left: List[Dict[str, Any]] = []
    unmatched_right = set(range(len(R)))

    # Paarbildung mit Gate
    for li in L:
        best_j = None
        best_score = 0.0
        best_gate = False
        for rj_idx, rj in enumerate(R):
            if rj_idx in used_right:
                continue
            score, gate_ok = _similarity(li, rj, tag_bonus)
            if gate_ok and score >= jaccard_threshold and score > best_score:
                best_score = score
                best_j = rj_idx
                best_gate = True

        if best_gate and best_j is not None:
            used_right.add(best_j)
            unmatched_right.discard(best_j)
            groups.append({
                "topic": _topic_label([li["item"]], [R[best_j]["item"]]),
                "left": [li["item"]],
                "right": [R[best_j]["item"]],
            })
        else:
            unmatched_left.append(li["item"])

    # unpassende nur bei gleichem Gate einsortieren
    def _fits_group(it: Dict[str, Any], grp: Dict[str, Any]) -> bool:
        g_tags: Set[str] = set()
        g_all: Set[str] = set()
        g_strong: Set[str] = set()
        for side in ("left","right"):
            for x in grp[side]:
                ca, cs = _item_tokens(x)
                g_all |= ca
                g_strong |= cs
                g_tags |= _tagset(x)
        ca, cs = _item_tokens(it)
        li = {"item": it, "tags": _tagset(it), "can_all": ca, "can_strong": cs}
        rj = {"item": {}, "tags": g_tags, "can_all": g_all, "can_strong": g_strong}
        score, gate_ok = _similarity(li, rj, tag_bonus)
        return gate_ok and score >= 0.12

    for it in unmatched_left:
        placed = False
        for grp in groups:
            if _fits_group(it, grp):
                grp["left"].append(it)
                placed = True
                break
        if not placed:
            groups.append({"topic": _topic_label([it], []), "left": [it], "right": []})

    for r_idx in sorted(list(unmatched_right)):
        it = R[r_idx]["item"]
        placed = False
        for grp in groups:
            if _fits_group(it, grp):
                grp["right"].append(it)
                placed = True
                break
        if not placed:
            groups.append({"topic": _topic_label([], [it]), "left": [], "right": [it]})

    # Finale Sortierung
    for grp in groups:
        grp["topic"] = _topic_label(grp["left"], grp["right"])

    def sort_key(g):
        both = 1 if (g["left"] and g["right"]) else 0
        size = len(g["left"]) + len(g["right"])
        return (-both, -size)

    groups.sort(key=sort_key)
    return groups
