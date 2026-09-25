import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

from api._youtube import query_params, resolve_audio


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = query_params(self)
        video_id = params.get("id", [""])[0].strip()
        force_refresh = "retry" in params or params.get("refresh", [""])[0] == "1"

        if not video_id:
            self.send_error(400, "Missing video id")
            return

        stream_url = resolve_audio(video_id, force_refresh=force_refresh)
        if not stream_url or not stream_url.startswith("https://"):
            self.send_error(503, "Audio stream is temporarily unavailable")
            return

        def stream_data(target_url, attempt=1):
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            }
            if "Range" in self.headers:
                headers["Range"] = self.headers["Range"]

            proxy_req = urllib.request.Request(target_url, headers=headers)
            try:
                with urllib.request.urlopen(proxy_req, timeout=12) as remote_stream:
                    status_code = remote_stream.status
                    self.send_response(status_code)

                    raw_content_type = remote_stream.headers.get("Content-Type", "")
                    content_type = raw_content_type if raw_content_type else "audio/mp4"

                    self.send_header("Content-Type", content_type)
                    if "Content-Length" in remote_stream.headers:
                        self.send_header("Content-Length", remote_stream.headers["Content-Length"])
                    if "Content-Range" in remote_stream.headers:
                        self.send_header("Content-Range", remote_stream.headers["Content-Range"])

                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
                    self.end_headers()

                    while True:
                        chunk = remote_stream.read(64 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
            except urllib.error.HTTPError as http_err:
                if attempt == 1 and http_err.code in (403, 410, 404):
                    fresh_url = resolve_audio(video_id, force_refresh=True)
                    if fresh_url and fresh_url != target_url:
                        return stream_data(fresh_url, attempt=2)
                self.send_error(http_err.code, f"Upstream error: {http_err.reason}")
            except Exception as e:
                if attempt == 1:
                    fresh_url = resolve_audio(video_id, force_refresh=True)
                    if fresh_url and fresh_url != target_url:
                        return stream_data(fresh_url, attempt=2)
                self.send_error(502, f"Stream proxy error: {e}")

        stream_data(stream_url)

    def do_HEAD(self):
        self.do_GET()