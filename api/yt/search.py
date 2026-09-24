from http.server import BaseHTTPRequestHandler

from api._youtube import json_response, query_params, search


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = query_params(self)
        query = params.get("q", [""])[0].strip()
        try:
            limit = min(max(int(params.get("limit", [25])[0]), 1), 50)
        except (TypeError, ValueError):
            limit = 25
        if not query:
            json_response(self, [])
            return
        try:
            json_response(self, search(query, limit))
        except Exception:
            json_response(self, {"error": "Music search is temporarily unavailable", "tracks": []}, 503)