from http.server import BaseHTTPRequestHandler

from api._youtube import json_response, search


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            json_response(self, search("trending music", 25))
        except Exception:
            json_response(self, {"error": "Trending music is temporarily unavailable", "tracks": []}, 503)