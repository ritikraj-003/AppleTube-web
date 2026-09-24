from http.server import BaseHTTPRequestHandler

from api._youtube import json_response


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        json_response(self, {"status": "online", "database": "YouTube Live", "version": "1.0.0"})