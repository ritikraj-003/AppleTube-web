from http.server import BaseHTTPRequestHandler

from api._youtube import json_response


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        yt_ok = False
        yt_msg = ""
        try:
            import yt_dlp
            yt_ok = True
            yt_msg = yt_dlp.version.__version__
        except Exception as e:
            yt_msg = str(e)

        json_response(self, {
            "status": "online",
            "database": "YouTube Live",
            "version": "1.2.3-android",
            "yt_dlp_installed": yt_ok,
            "yt_dlp_info": yt_msg
        })