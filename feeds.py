from flask import Blueprint, request, jsonify
import rss_client
import matcher

feeds_bp = Blueprint("feeds", __name__)

def _apply_query(items, q: str | None):
    if not q:
        return items
    q = q.strip().lower()
    out = []
    for it in items:
        hay = " ".join([
            it.get("title",""),
            it.get("summary",""),
            " ".join(it.get("tags") or []),
            it.get("source",""),
        ]).lower()
        if q in hay:
            out.append(it)
    return out

@feeds_bp.get("/api/feeds")
def api_feeds():
    """
    Liefert thematische Gruppen aus zwei Feeds.
    Query-Parameter:
      - left (default: 'srf')
      - right (default: 'tagesschau')
      - limit (default: 20)
      - q (optional Volltext-Filter über Titel, Summary, Tags, Quelle)
      - thr (optional Float für Jaccard-Schwelle, default 0.28)
    Response:
      {
        ok: true,
        meta: { left_key, right_key, count_left, count_right, groups },
        data: {
          groups: [ { topic, left: [...], right: [...] }, ... ]
        }
      }
    """
    left_key  = request.args.get("left", "srf").strip().lower()
    right_key = request.args.get("right", "tagesschau").strip().lower()
    limit     = int(request.args.get("limit", "20"))
    q         = (request.args.get("q") or "").strip() or None

    # optional: Ähnlichkeitsschwelle justierbar
    try:
        thr = float(request.args.get("thr", "0.20"))  # vorher: "0.28"
    except ValueError:
        thr = 0.20

    try:
        left_items  = rss_client.fetch(left_key,  limit=limit)
        right_items = rss_client.fetch(right_key, limit=limit)
    except KeyError as e:
        return jsonify({"ok": False, "error": f"unknown feed key: {e}"}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": f"fetch failed: {e}"}), 502

    # Optionaler Volltext-Filter
    left_f  = _apply_query(left_items, q)
    right_f = _apply_query(right_items, q)

    # Paarbildung / Gruppierung
    groups = matcher.match_pairs(left_f, right_f, jaccard_threshold=thr)

    return jsonify({
        "ok": True,
        "meta": {
            "left_key": left_key,
            "right_key": right_key,
            "count_left": len(left_f),
            "count_right": len(right_f),
            "groups": len(groups),
        },
        "data": {
            "groups": groups
        }
    })

@feeds_bp.get("/api/health")
def health():
    """
    Kleine Gesundheits-/Smoke-Check-Route, jetzt inkl. Gruppenzahl.
    """
    try:
        l = rss_client.fetch("srf", limit=6)
        r = rss_client.fetch("tagesschau", limit=6)
        groups = matcher.match_pairs(l, r)
        return jsonify({
            "ok": True,
            "left_count": len(l),
            "right_count": len(r),
            "group_count": len(groups),
            "samples": {
                "left": [a["title"] for a in l[:3]],
                "right": [a["title"] for a in r[:3]],
                "topics": [g["topic"] for g in groups[:3]],
            }
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502
