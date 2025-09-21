# rss_client.py
# RSS-Client mit Extraktion von Titel, Summary(als Klartext), Link, Datum, Tags und Bildern.
from datetime import datetime
from html import unescape
from html.parser import HTMLParser
import re
import requests, feedparser

HEADERS = {"User-Agent": "NeutralNews/1.0 (+local test)"}
TIMEOUT = 12

FEEDS = {
    "nzz":        ("NZZ",        "https://www.nzz.ch/recent.rss"),
    "spiegel":    ("Spiegel",    "https://www.spiegel.de/schlagzeilen/index.rss"),
    "srf":        ("SRF",        "https://www.srf.ch/news/bnf/rss/1646"),   # Beispiel
    "tagesschau": ("Tagesschau", "https://www.tagesschau.de/xml/rss2"),     # Beispiel
}

def _fetch(url:str)->bytes:
    r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.content

def _dt(e):
    try:
        if getattr(e, "published_parsed", None):
            return datetime(*e.published_parsed[:6]).strftime("%Y-%m-%d %H:%M")
    except:
        pass
    return ""

def _link(e):
    if e.get("link"):
        return e["link"]
    for l in e.get("links",[]) or []:
        if l.get("href"):
            return l["href"]
    return ""

def _tags(e):
    tags = []
    for t in e.get("tags") or []:
        label = t.get("term") if isinstance(t, dict) else str(t)
        if label:
            tags.append(unescape(label))
    return tags

# ------- HTML -> Klartext + Bild aus summary/description/content extrahieren -------

class _SummaryExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts = []
        self.image = None

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t in ("br","p","div","li"):
            self._parts.append(" ")
        if t == "img" and self.image is None:
            d = dict(attrs)
            src = d.get("src") or d.get("data-src") or d.get("data-original")
            if src:
                self.image = src

    def handle_data(self, data):
        if data:
            s = data.strip()
            if s:
                self._parts.append(s)

    def text(self):
        text = " ".join(self._parts)
        # Whitespace normalisieren
        text = re.sub(r"\s+", " ", text).strip()
        return text

def _raw_html_block(e) -> str:
    # Reihenfolge: summary -> description -> content[0].value
    if e.get("summary"):
        return e.get("summary") or ""
    if e.get("description"):
        return e.get("description") or ""
    content = e.get("content")
    if content and isinstance(content, list) and content and isinstance(content[0], dict):
        return content[0].get("value","") or ""
    return ""

def _image_from_struct(e):
    # 1) media_content
    if "media_content" in e:
        mc = e.get("media_content") or []
        if mc and mc[0].get("url"):
            return mc[0]["url"]
    # 2) media_thumbnail
    if "media_thumbnail" in e:
        mt = e.get("media_thumbnail") or []
        if mt and mt[0].get("url"):
            return mt[0]["url"]
    # 3) enclosures
    if "enclosures" in e:
        for enc in e["enclosures"]:
            if enc.get("href") and enc.get("type","").startswith("image"):
                return enc["href"]
    return None

def _summary_and_image(e):
    raw_html = _raw_html_block(e)
    raw_html = unescape(raw_html)
    # Erst Bild aus strukturierten Feldern, sonst aus HTML
    image = _image_from_struct(e)

    # HTML -> Text + ggf. Bild
    parser = _SummaryExtractor()
    try:
        parser.feed(raw_html)
    except Exception:
        # Fallback: falls kaputtes HTML
        pass
    text = parser.text()
    if image is None and parser.image:
        image = parser.image

    return text, image

# -----------------------------------------------------------------------------------

def fetch(feed_key:str, limit:int=20):
    if feed_key not in FEEDS:
        raise KeyError(feed_key)
    name, url = FEEDS[feed_key]
    parsed = feedparser.parse(_fetch(url))
    items = []
    for e in parsed.entries[:limit]:
        summary, image = _summary_and_image(e)
        items.append({
            "source": name,
            "title": unescape(e.get("title","")),
            "summary": summary,      # jetzt sauberer Klartext, keine "hspace/align"
            "url": _link(e),
            "published": _dt(e),
            "tags": _tags(e),
            "image": image,
        })
    return items
