from http.server import BaseHTTPRequestHandler

from api._youtube import query_params, resolve_audio


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        video_id = query_params(self).get("id", [""])[0].strip()
        if not video_id:
            self.send_error(400, "Missing video id")
            return
        stream_url = resolve_audio(video_id)
        if not stream_url or not stream_url.startswith("https://"):
            self.send_error(503, "Audio stream is temporarily unavailable")
            return
        self.send_response(302)
        self.send_header("Location", stream_url)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", "audio/mp4")
        self.end_headers()

    def do_HEAD(self):
        self.do_GET()