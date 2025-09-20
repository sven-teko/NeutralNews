# Rss client
from datetime import datetime
from html import unescape
import requests, feedparser

HEADERS = {"User-Agent": "NeutralNews/1.0 (+local test)"}
TIMEOUT = 12

FEEDS = {
    "nzz":    ("NZZ",    "https://www.nzz.ch/recent.rss"),
    "spiegel":("Spiegel","https://www.spiegel.de/schlagzeilen/index.rss"),
}

def _fetch(url:str)->bytes:
    r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.content

def _dt(e):
    try:
        if getattr(e,"published_parsed",None):
            return datetime(*e.published_parsed[:6]).strftime("%Y-%m-%d %H:%M")
    except: pass
    return ""

def _link(e):
    if e.get("link"): return e["link"]
    for l in e.get("links",[]) or []:
        if l.get("href"): return l["href"]
    return ""

def _summary(e):
    return unescape(e.get("summary") or e.get("description") or "")

def fetch(feed_key:str, limit:int=20):
    if feed_key not in FEEDS:
        raise KeyError(feed_key)
    name,url = FEEDS[feed_key]
    parsed = feedparser.parse(_fetch(url))
    items=[]
    for e in parsed.entries[:limit]:
        items.append({
            "source": name,
            "title": unescape(e.get("title","")),
            "summary": _summary(e),
            "url": _link(e),
            "published": _dt(e),
        })
    return items
