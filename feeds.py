from flask import Blueprint, request, jsonify
import rss_client

feeds_bp = Blueprint("feeds", __name__)

# Feeds
@feeds_bp.get("/api/feeds")
def api_feeds():
    q     = (request.args.get("q") or "").strip()
    limit = int(request.args.get("limit", "20"))
    left  = rss_client.fetch_test_left(limit=limit, q=q if q else None)
    right = rss_client.fetch_test_right(limit=limit, q=q if q else None)
    return jsonify({"ok": True, "data": {"srf": left, "tagesschau": right}})

@feeds_bp.get("/api/health")
def health():
    l = rss_client.fetch_test_left(limit=3)
    r = rss_client.fetch_test_right(limit=3)
    return jsonify({
        "ok": True,
        "left_count": len(l),
        "right_count": len(r),
        "samples": {
            "left": [a["title"] for a in l],
            "right": [a["title"] for a in r],
        }
    })
