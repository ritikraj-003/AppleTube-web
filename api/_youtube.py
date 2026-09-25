import json
import urllib.parse
import urllib.request


def json_response(handler, payload, status=200, cache_control="public, max-age=60, s-maxage=300"):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Cache-Control", cache_control)
    handler.end_headers()
    handler.wfile.write(body)


def query_params(handler):
    parsed = urllib.parse.urlparse(handler.path)
    return urllib.parse.parse_qs(parsed.query)


def youtube_request(path, payload):
    request = urllib.request.Request(
        f"https://www.youtube.com/youtubei/v1/{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Origin": "https://www.youtube.com",
            "Referer": "https://www.youtube.com/",
            "User-Agent": "Mozilla/5.0",
        },
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def parse_search_results(data, limit):
    sections = (
        data.get("contents", {})
        .get("twoColumnSearchResultsRenderer", {})
        .get("primaryContents", {})
        .get("sectionListRenderer", {})
        .get("contents", [])
    )
    tracks = []
    for section in sections:
        for item in section.get("itemSectionRenderer", {}).get("contents", []):
            video = item.get("videoRenderer")
            if not video or not video.get("videoId"):
                continue
            video_id = video["videoId"]
            title_runs = video.get("title", {}).get("runs", [])
            artist_runs = video.get("ownerText", {}).get("runs", [])
            duration = video.get("lengthText", {}).get("simpleText", "3:30")
            parts = duration.split(":")
            try:
                seconds = sum(int(part) * (60 ** index) for index, part in enumerate(reversed(parts)))
            except (TypeError, ValueError):
                seconds = 210
            thumbnails = video.get("thumbnail", {}).get("thumbnails", [])
            tracks.append({
                "id": f"yt_{video_id}",
                "videoId": video_id,
                "title": title_runs[0].get("text", "YouTube Track") if title_runs else "YouTube Track",
                "artist": artist_runs[0].get("text", "YouTube Artist") if artist_runs else "YouTube Artist",
                "album": "YouTube Music",
                "duration": seconds,
                "image": thumbnails[-1].get("url") if thumbnails else f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                "audioUrl": f"/api/yt/audio?id={video_id}",
                "source": "YouTube Live",
                "hasLyrics": False,
            })
            if len(tracks) >= limit:
                return tracks
    return tracks


def search(query, limit=25):
    try:
        data = youtube_request(
            "search",
            {
                "context": {"client": {"clientName": "WEB", "clientVersion": "2.20240918.01.00", "hl": "en", "gl": "US"}},
                "query": query,
            },
        )
        tracks = parse_search_results(data, limit)
        if tracks:
            return tracks
    except Exception:
        pass

    for instance in ("https://inv.nadeko.net", "https://invidious.nerdvpn.de", "https://yt.artemislena.eu"):
        try:
            request = urllib.request.Request(
                f"{instance}/api/v1/search?q={urllib.parse.quote(query)}&type=video",
                headers={"User-Agent": "Mozilla/5.0"},
            )
            with urllib.request.urlopen(request, timeout=6) as response:
                items = json.loads(response.read().decode("utf-8"))
            tracks = []
            for item in items[:limit] if isinstance(items, list) else []:
                video_id = item.get("videoId")
                if not video_id:
                    continue
                tracks.append({
                    "id": f"yt_{video_id}",
                    "videoId": video_id,
                    "title": item.get("title", "YouTube Track"),
                    "artist": item.get("author", "YouTube Artist"),
                    "album": "YouTube Music",
                    "duration": int(item.get("lengthSeconds", 210) or 210),
                    "image": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                    "audioUrl": f"/api/yt/audio?id={video_id}",
                    "source": "YouTube Live",
                    "hasLyrics": False,
                })
            if tracks:
                return tracks
        except Exception:
            continue
    return []


import time

AUDIO_URL_CACHE = {}

LAST_RESOLVE_ERROR = None

def resolve_audio(video_id, force_refresh=False):
    global LAST_RESOLVE_ERROR
    if not video_id:
        return None

    if force_refresh:
        AUDIO_URL_CACHE.pop(video_id, None)
    elif video_id in AUDIO_URL_CACHE:
        entry = AUDIO_URL_CACHE[video_id]
        if isinstance(entry, tuple) and len(entry) == 2:
            url, ts = entry
            if time.time() - ts < 7200:
                return url
        elif isinstance(entry, str):
            return entry

    # Method 1: yt-dlp extractor
    try:
        import yt_dlp
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'socket_timeout': 10,
            'nocheckcertificate': True,
            'extractor_args': {
                'youtube': {
                    'player_client': ['android'],
                    'player_skip': ['webpage', 'configs', 'initial_data']
                }
            }
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            stream_url = info.get('url')
            if stream_url:
                AUDIO_URL_CACHE[video_id] = (stream_url, time.time())
                return stream_url
    except Exception as e:
        LAST_RESOLVE_ERROR = f"yt-dlp: {type(e).__name__}: {e}"
        print(f"[api/_youtube yt-dlp error for {video_id}]: {e}")

    # Method 2: Active Piped / Invidious fallback
    for instance in (
        "https://pipedapi.adminforge.de",
        "https://api.piped.privacydev.net",
        "https://pipedapi.kavin.rocks",
    ):
        try:
            request = urllib.request.Request(f"{instance}/streams/{urllib.parse.quote(video_id)}", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=6) as response:
                data = json.loads(response.read().decode("utf-8"))
            streams = [stream for stream in data.get("audioStreams", []) if stream.get("url")]
            if streams:
                streams.sort(key=lambda stream: stream.get("bitrate", 0), reverse=True)
                url = streams[0]["url"]
                AUDIO_URL_CACHE[video_id] = (url, time.time())
                return url
        except Exception:
            continue
    return None