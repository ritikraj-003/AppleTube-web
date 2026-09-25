#!/usr/bin/env python3
"""
Aura Music - Live YouTube Database Server, Auth System & Audio Streamer
Zero external dependencies (uses Python standard library only)
"""

import sys
import os
import re
import json
import uuid
import hashlib
import time
import random
import socket
import threading
import urllib.request
import urllib.parse
import urllib.error
from http.server import SimpleHTTPRequestHandler, HTTPServer, ThreadingHTTPServer

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    
    _session = requests.Session()
    _adapter = HTTPAdapter(
        pool_connections=40,
        pool_maxsize=40,
        max_retries=Retry(total=1, backoff_factor=0.1)
    )
    _session.mount('https://', _adapter)
    _session.mount('http://', _adapter)
    HTTP_SESSION = _session
except Exception:
    HTTP_SESSION = None

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000

# Base directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
USERS_FILE = os.path.join(DATA_DIR, 'users.json')

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR, exist_ok=True)

# Cache resolved audio URLs in memory to make repeat & scrubbing instant
AUDIO_URL_CACHE = {}

# Active login sessions: token -> user_id
ACTIVE_SESSIONS = {}

# Google OAuth Configuration (Google Cloud Console OAuth 2.0 Client ID)
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '').strip() or '478691904536-p5mjbadl4bcjusu6ou4jg0e99q4kcfse.apps.googleusercontent.com'

# High-speed LRU Caches for Searches, Suggestions, and Trending
SEARCH_CACHE_LOCK = threading.Lock()
SEARCH_CACHE = {}  # key -> {"data": [...], "ts": float}
SEARCH_CACHE_TTL = 7200  # 2 hours
SEARCH_CACHE_MAX = 1000

SUGGESTIONS_CACHE_LOCK = threading.Lock()
SUGGESTIONS_CACHE = {}  # key -> {"data": {...}, "ts": float}
SUGGESTIONS_CACHE_TTL = 3600  # 1 hour
SUGGESTIONS_CACHE_MAX = 1000

TRENDING_CACHE_LOCK = threading.Lock()
TRENDING_CACHE = {"data": [], "ts": 0}
TRENDING_CACHE_TTL = 3600  # 1 hour

def get_from_cache(cache, lock, key, ttl):
    with lock:
        item = cache.get(key)
        if item and (time.time() - item.get("ts", 0) < ttl):
            return item["data"]
        elif item:
            cache.pop(key, None)
    return None

def set_in_cache(cache, lock, key, data, max_size):
    with lock:
        if len(cache) >= max_size:
            sorted_keys = sorted(cache.keys(), key=lambda k: cache[k].get("ts", 0))
            for k in sorted_keys[:max(1, max_size // 5)]:
                cache.pop(k, None)
        cache[key] = {"data": data, "ts": time.time()}

PIPED_INSTANCES = [
    'https://pipedapi.adminforge.de',
    'https://api.piped.privacydev.net',
    'https://pipedapi.kavin.rocks',
    'https://piped-api.garudalinux.org'
]

INVIDIOUS_MIRRORS = [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://invidious.jing.rocks',
    'https://invidious.privacydev.net',
    'https://yt.artemislena.eu'
]
INVIDIOUS_INSTANCES = INVIDIOUS_MIRRORS

# --- Database / User Persistence Helpers ---
def load_users():
    if not os.path.exists(USERS_FILE):
        return {}
    try:
        with open(USERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def save_users(users):
    try:
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(users, f, indent=2)
    except Exception as e:
        print(f"[Error saving users]: {e}", file=sys.stderr)

def hash_password(password, salt=None):
    if not salt:
        salt = uuid.uuid4().hex
    hashed = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
    return hashed, salt

def verify_google_token(credential=None, access_token=None):
    """
    Cryptographically verify a Google ID Token (credential) or OAuth Access Token
    using Google's official public verification endpoints.
    Returns: dict with verified user claims {sub, email, name, picture} or None.
    """
    user_info = None

    if credential:
        verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(credential)}"
        try:
            req = urllib.request.Request(
                verify_url,
                headers={"User-Agent": "AppleTube-Auth/1.0"}
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode('utf-8'))
                    aud = data.get('aud')
                    if aud != GOOGLE_CLIENT_ID:
                        print(f"[AUTH ERROR] Google token audience mismatch: received={aud!r}, expected={GOOGLE_CLIENT_ID!r}", flush=True)
                        return None
                    if not data.get('sub') or not data.get('email'):
                        print(f"[AUTH ERROR] Google ID token missing required claims: sub={bool(data.get('sub'))}, email={bool(data.get('email'))}", flush=True)
                        return None
                    email_verified = data.get('email_verified')
                    if email_verified not in (True, 'true', 'True', 1, '1'):
                        print(f"[AUTH ERROR] Google ID token email is not verified: email_verified={email_verified!r}", flush=True)
                        return None
                    user_info = {
                        "sub": str(data.get('sub')),
                        "email": str(data.get('email')).lower().strip(),
                        "name": str(data.get('name') or data.get('email').split('@')[0]).strip(),
                        "picture": str(data.get('picture') or '').strip()
                    }
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8', errors='replace')
            print(f"[AUTH ERROR] Google ID token verification failed: HTTP {e.code}: {error_body}", flush=True)
        except Exception as e:
            print(f"[AUTH ERROR] Google ID token verification failed: {e}", flush=True)

    elif access_token:
        userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        try:
            req = urllib.request.Request(
                userinfo_url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "User-Agent": "AppleTube-Auth/1.0"
                }
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode('utf-8'))
                    if data.get('sub') and data.get('email'):
                        user_info = {
                            "sub": str(data.get('sub')),
                            "email": str(data.get('email')).lower().strip(),
                            "name": str(data.get('name') or data.get('email').split('@')[0]).strip(),
                            "picture": str(data.get('picture') or '').strip()
                        }
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8', errors='replace')
            print(f"[AUTH ERROR] Google access token verification failed: HTTP {e.code}: {error_body}", flush=True)
        except Exception as e:
            print(f"[AUTH ERROR] Google access token verification failed: {e}", flush=True)

    return user_info

# --- String & Format Helpers ---
def parse_duration_to_seconds(dur_str):
    if not dur_str:
        return 180
    parts = dur_str.strip().split(':')
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 1:
            return int(parts[0])
    except Exception:
        pass
    return 180

def clean_title(title):
    if not title:
        return "YouTube Music"
    title = re.sub(r'\(Official (Music )?Video\)', '', title, flags=re.I)
    title = re.sub(r'\[Official (Music )?Video\]', '', title, flags=re.I)
    title = re.sub(r'\(Official Audio\)', '', title, flags=re.I)
    title = re.sub(r'\[Official Audio\]', '', title, flags=re.I)
    title = re.sub(r'\(Lyric Video\)', '', title, flags=re.I)
    title = re.sub(r'\[Lyrics\]', '', title, flags=re.I)
    title = re.sub(r'\(Visualizer\)', '', title, flags=re.I)
    title = re.sub(r'\|.*$', '', title)
    return title.strip()

def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "", name).strip() or "track"

# --- YouTube Database Engine ---
def search_youtube_innertube(query, limit=30):
    url = "https://www.youtube.com/youtubei/v1/search"
    payload = {
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20240101.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "query": query
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Content-Type": "application/json",
        "Origin": "https://www.youtube.com",
        "Referer": "https://www.youtube.com/"
    }

    try:
        data = None
        if HTTP_SESSION is not None:
            resp = HTTP_SESSION.post(url, json=payload, headers=headers, timeout=6.0)
            if resp.status_code == 200:
                data = resp.json()
        else:
            req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
            with urllib.request.urlopen(req, timeout=6.0) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
            
        if not data:
            return None

        results = []
        sections = data.get('contents', {}).get('twoColumnSearchResultsRenderer', {}).get('primaryContents', {}).get('sectionListRenderer', {}).get('contents', [])

        for sec in sections:
            items = sec.get('itemSectionRenderer', {}).get('contents', [])
            for item in items:
                candidates = []
                if 'shelfRenderer' in item:
                    shelf_content = item['shelfRenderer'].get('content', {})
                    if 'verticalListRenderer' in shelf_content:
                        candidates.extend(shelf_content['verticalListRenderer'].get('items', []))
                    elif 'horizontalListRenderer' in shelf_content:
                        candidates.extend(shelf_content['horizontalListRenderer'].get('items', []))
                else:
                    candidates.append(item)

                for cand in candidates:
                    v = cand.get('videoRenderer') or cand.get('gridVideoRenderer')
                    vid = None
                    title = 'YouTube Track'
                    author = 'YouTube Artist'
                    duration = 210
                    img = None

                    if v and v.get('videoId'):
                        vid = v['videoId']
                        title_runs = v.get('title', {}).get('runs', [])
                        title_text = v.get('title', {}).get('simpleText') or (title_runs[0].get('text') if title_runs else None)
                        title = clean_title(title_text or 'YouTube Track')
                        
                        author_runs = v.get('ownerText', {}).get('runs', [])
                        author = author_runs[0].get('text', 'YouTube Artist') if author_runs else 'YouTube Artist'

                        dur_str = v.get('lengthText', {}).get('simpleText', '3:30')
                        duration = parse_duration_to_seconds(dur_str)

                        thumbs = v.get('thumbnail', {}).get('thumbnails', [])
                        img = thumbs[-1].get('url') if thumbs else f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                    elif 'lockupViewModel' in cand:
                        lvm = cand['lockupViewModel']
                        tap_cmd = lvm.get('rendererContext', {}).get('commandContext', {}).get('onTap', {}).get('innertubeCommand', {})
                        watch_ep = tap_cmd.get('watchEndpoint', {})
                        cand_vid = watch_ep.get('videoId')
                        if not cand_vid:
                            cand_id = lvm.get('contentId', '')
                            if cand_id and len(cand_id) == 11 and not cand_id.startswith('RD'):
                                cand_vid = cand_id
                        if not cand_vid:
                            continue
                        vid = cand_vid
                        
                        title_part = lvm.get('metadata', {}).get('lockupMetadataViewModel', {}).get('title', {})
                        title_val = title_part.get('content') or (title_part.get('runs', [{}])[0].get('text') if title_part.get('runs') else None)
                        title = clean_title(title_val or 'YouTube Track')
                        
                        meta_rows = lvm.get('metadata', {}).get('lockupMetadataViewModel', {}).get('metadata', {}).get('contentMetadataViewModel', {}).get('metadataRows', [])
                        if meta_rows:
                            parts = meta_rows[0].get('metadataParts', [])
                            if parts:
                                author = parts[0].get('text', {}).get('content', 'YouTube Artist')

                        img = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                    else:
                        continue

                    if not vid:
                        continue

                    audio_url = f"/api/yt/audio?id={vid}"

                    results.append({
                        "id": f"yt_{vid}",
                        "videoId": vid,
                        "title": title,
                        "artist": author,
                        "album": "YouTube Music",
                        "duration": duration,
                        "image": img,
                        "audioUrl": audio_url,
                        "source": "YouTube Live",
                        "hasLyrics": False
                    })

                    if len(results) >= limit:
                        break
                if len(results) >= limit:
                    break
            if len(results) >= limit:
                break

        return results
    except Exception as e:
        print(f"[InnerTube Search Error]: {e}", file=sys.stderr)
        return None

def search_youtube_invidious(query, limit=25):
    for mirror in INVIDIOUS_MIRRORS[:3]:
        try:
            url = f"{mirror}/api/v1/search?q={urllib.parse.quote(query)}&type=video"
            items = None
            if HTTP_SESSION is not None:
                resp = HTTP_SESSION.get(url, headers={"User-Agent": "AuraMusic/1.3"}, timeout=2.5)
                if resp.status_code == 200:
                    items = resp.json()
            else:
                req = urllib.request.Request(url, headers={"User-Agent": "AuraMusic/1.3"})
                with urllib.request.urlopen(req, timeout=2.5) as response:
                    if response.status == 200:
                        items = json.loads(response.read().decode('utf-8'))

            if isinstance(items, list) and len(items) > 0:
                results = []
                for item in items[:limit]:
                    vid = item.get('videoId')
                    if not vid:
                        continue
                    results.append({
                        "id": f"yt_{vid}",
                        "videoId": vid,
                        "title": clean_title(item.get('title', 'YouTube Track')),
                        "artist": item.get('author', 'YouTube Artist'),
                        "album": "YouTube Music",
                        "duration": int(item.get('lengthSeconds', 180)),
                        "image": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                        "audioUrl": f"/api/yt/audio?id={vid}",
                        "source": "YouTube Live",
                        "hasLyrics": False
                    })
                return results
        except Exception:
            continue
    return []

def get_youtube_suggestions(query, limit=8):
    if not query or not query.strip():
        return {"query": "", "suggestions": [], "songs": []}

    q_clean = query.strip()
    cache_key = q_clean.lower()
    cached = get_from_cache(SUGGESTIONS_CACHE, SUGGESTIONS_CACHE_LOCK, cache_key, SUGGESTIONS_CACHE_TTL)
    if cached:
        return cached

    suggestions = []
    # 1. Autocomplete keyword suggestions from Google/YouTube query suggestions API
    try:
        url = f"https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q={urllib.parse.quote(q_clean)}"
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
        data = None
        if HTTP_SESSION is not None:
            r = HTTP_SESSION.get(url, headers=headers, timeout=1.8)
            if r.status_code == 200:
                data = r.json()
        else:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=1.8) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode('utf-8'))

        if data and isinstance(data, list) and len(data) > 1 and isinstance(data[1], list):
            suggestions = [s for s in data[1][:limit] if isinstance(s, str)]
    except Exception as e:
        print(f"[Suggestion Query Error]: {e}", file=sys.stderr)

    # 2. Extract matching songs from in-memory search cache or quick search
    song_matches = []
    with SEARCH_CACHE_LOCK:
        if cache_key in SEARCH_CACHE:
            for item in SEARCH_CACHE[cache_key].get("data", []):
                if item not in song_matches:
                    song_matches.append(item)
                if len(song_matches) >= 4:
                    break
        else:
            for k, val in SEARCH_CACHE.items():
                if k in cache_key or cache_key in k:
                    for t in val.get("data", []):
                        title = t.get("title", "").lower()
                        artist = t.get("artist", "").lower()
                        if (q_clean in title or q_clean in artist) and t not in song_matches:
                            song_matches.append(t)
                        if len(song_matches) >= 4:
                            break
                if len(song_matches) >= 4:
                    break

    # If no cached song matches, fetch top 3-4 songs via fast Innertube
    if len(song_matches) < 3:
        try:
            quick_tracks = search_youtube_innertube(q_clean, limit=4)
            if quick_tracks:
                for qt in quick_tracks:
                    if qt not in song_matches:
                        song_matches.append(qt)
        except Exception:
            pass

    formatted_songs = []
    for s in song_matches[:4]:
        formatted_songs.append({
            "id": s.get("id"),
            "videoId": s.get("videoId"),
            "title": s.get("title"),
            "artist": s.get("artist"),
            "album": s.get("album", "YouTube Music"),
            "duration": s.get("duration", 180),
            "image": s.get("image"),
            "audioUrl": s.get("audioUrl"),
            "source": s.get("source", "YouTube Live")
        })

    result = {
        "query": q_clean,
        "suggestions": suggestions,
        "songs": formatted_songs
    }

    set_in_cache(SUGGESTIONS_CACHE, SUGGESTIONS_CACHE_LOCK, cache_key, result, SUGGESTIONS_CACHE_MAX)
    return result

def get_youtube_trending():
    with TRENDING_CACHE_LOCK:
        if TRENDING_CACHE["data"] and (time.time() - TRENDING_CACHE["ts"] < TRENDING_CACHE_TTL):
            return TRENDING_CACHE["data"]

    # Directly use InnerTube trending search for reliable and fast response
    results = search_youtube_innertube("Trending songs", limit=25) or []

    if not results:
        # Fallback to invidious mirrors if innertube fails
        for mirror in INVIDIOUS_MIRRORS[:3]:
            try:
                url = f"{mirror}/api/v1/trending?type=music"
                items = None
                if HTTP_SESSION is not None:
                    resp = HTTP_SESSION.get(url, headers={"User-Agent": "AuraMusic/1.3"}, timeout=2.0)
                    if resp.status_code == 200:
                        items = resp.json()
                else:
                    req = urllib.request.Request(url, headers={"User-Agent": "AuraMusic/1.3"})
                    with urllib.request.urlopen(req, timeout=2.0) as response:
                        if response.status == 200:
                            items = json.loads(response.read().decode('utf-8'))

                if isinstance(items, list) and len(items) > 0:
                    for item in items[:25]:
                        vid = item.get('videoId')
                        if not vid:
                            continue
                        results.append({
                            "id": f"yt_{vid}",
                            "videoId": vid,
                            "title": clean_title(item.get('title', 'YouTube Track')),
                            "artist": item.get('author', 'Trending Artist'),
                            "album": "Trending Hits",
                            "duration": int(item.get('lengthSeconds', 180)),
                            "image": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                            "audioUrl": f"/api/yt/audio?id={vid}",
                            "source": "Trending Hits",
                            "hasLyrics": False
                        })
                    break
            except Exception:
                continue

    if results:
        for r in results:
            r["album"] = "Trending Hits"
            r["source"] = "Trending Hits"
        with TRENDING_CACHE_LOCK:
            TRENDING_CACHE["data"] = results
            TRENDING_CACHE["ts"] = time.time()

    return results

# --- Mood Keywords & Classification Dictionary ---
MOOD_KEYWORDS = {
    "sad": [
        "sad", "dard", "heartbreak", "crying", "broken", "lonely", "tear", "alone", "miss you",
        "judaai", "rona", "slowed", "reverb", "melancholy", "depressing", "depressed", "acoustic",
        "dard bhare", "gam", "alvida", "goodbye", "hurt", "pain", "channa mereya", "tujhe bhula diya",
        "agar tum saath ho", "tum hi ho", "phir bhi tumko chaahunga", "bekhayali", "judai", "judaiyaan",
        "bewafa", "tanha", "tanhaai", "emotional", "acoustic version", "sad version", "piano version",
        "unplugged", "breakup", "someone like you", "drivers license", "traitor",
        "all too well", "drown", "grief", "broken heart", "sad lofi", "mann bharryaa"
    ],
    "happy": [
        "happy", "party", "dance", "celebration", "fun", "joy", "cheerful", "smile", "club",
        "groove", "remix", "bhangra", "nacho", "dhamaka", "masti", "disco", "upbeat", "bouncy",
        "sunny", "feel good", "summer", "excited", "hookah bar", "kala chashma", "kar gayi chull",
        "london thumakda", "party all night", "abhi toh party", "high rated gabru", "can't stop the feeling",
        "uptown funk", "levitating", "good time", "celebrate", "cheers", "dhol", "bhangra hits",
        "24k magic", "dynamite", "butter", "peppy", "dhamakedar", "proper patola", "bom diggy"
    ],
    "romantic": [
        "love", "romantic", "romance", "pyaar", "ishq", "dil", "mohabbat", "humsafar", "deewana",
        "crush", "sweetheart", "kiss", "forever", "valentine", "sanam", "pehla nasha",
        "raataan lambiyan", "kesariya", "shayad", "tum se hi", "enchanted", "lover", "perfect",
        "golden hour", "tera ban jaunga", "khairiyat", "mast magan", "tum mile", "shiddat"
    ],
    "chill": [
        "chill", "lofi", "lo-fi", "relax", "sleep", "calm", "coffee", "study", "peace", "soft",
        "night drive", "vibes", "breeze", "ambient", "deep focus", "rain", "midnight", "slow down"
    ],
    "energetic": [
        "gym", "workout", "motivation", "hardstyle", "bass boosted", "trap", "phonk", "aggressive",
        "power", "beast", "rock", "metal", "hype", "workout mix", "pump up", "monster", "believer"
    ]
}

def detect_mood(title, artist=""):
    text = f"{title} {artist}".lower()
    scores = {"sad": 0, "happy": 0, "romantic": 0, "chill": 0, "energetic": 0}
    for mood, keywords in MOOD_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                if re.search(r'\b' + re.escape(kw) + r'\b', text):
                    scores[mood] += 3
                else:
                    scores[mood] += 1
    
    best_mood = max(scores, key=scores.get)
    if scores[best_mood] > 0:
        return best_mood
    return "chill"

def get_youtube_related(video_id=None, mood=None, current_title="", artist="", limit=20):
    if not mood:
        mood = detect_mood(current_title, artist)

    candidates = []
    seen_ids = set()
    if video_id:
        seen_ids.add(video_id)

    # 1. Try YouTube InnerTube Next API if video_id provided
    if video_id:
        try:
            url = "https://www.youtube.com/youtubei/v1/next"
            payload = {
                "context": {
                    "client": {
                        "clientName": "WEB",
                        "clientVersion": "2.20230522.01.00",
                        "hl": "en",
                        "gl": "US"
                    }
                },
                "videoId": video_id
            }
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Content-Type": "application/json",
                "Origin": "https://www.youtube.com",
                "Referer": "https://www.youtube.com/"
            }
            data = None
            if HTTP_SESSION is not None:
                resp = HTTP_SESSION.post(url, json=payload, headers=headers, timeout=4.5)
                if resp.status_code == 200:
                    data = resp.json()
            else:
                req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
                with urllib.request.urlopen(req, timeout=4.5) as response:
                    if response.status == 200:
                        data = json.loads(response.read().decode('utf-8'))

            if data:
                results = data.get('contents', {}).get('twoColumnWatchNextResults', {}).get('secondaryResults', {}).get('secondaryResults', {}).get('results', [])
                for r in results:
                    c = r.get('compactVideoRenderer')
                    if not c or not c.get('videoId'):
                        continue
                    vid = c.get('videoId')
                    if vid in seen_ids:
                        continue

                    dur_str = c.get('lengthText', {}).get('simpleText', '3:30')
                    duration = parse_duration_to_seconds(dur_str)

                    # Filter out long compilation mixes or podcasts (>10 mins / 600s) and tiny clips (<30s)
                    if duration > 600 or (duration > 0 and duration < 30):
                        continue

                    seen_ids.add(vid)
                    t_text = c.get('title', {}).get('simpleText') or (c.get('title', {}).get('runs', [{}])[0].get('text', 'YouTube Track'))
                    title = clean_title(t_text)
                    byline = c.get('shortBylineText', {}).get('runs', [{}])[0].get('text', 'YouTube Artist')

                    thumbs = c.get('thumbnail', {}).get('thumbnails', [])
                    img = thumbs[-1].get('url') if thumbs else f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"

                    track_mood = detect_mood(title, byline)
                    candidates.append({
                        "id": f"yt_{vid}",
                        "videoId": vid,
                        "title": title,
                        "artist": byline,
                        "album": "YouTube Recommendation",
                        "duration": duration,
                        "image": img,
                        "audioUrl": f"/api/yt/audio?id={vid}",
                        "source": "YouTube Live",
                        "mood": track_mood,
                        "hasLyrics": False
                    })
        except Exception as e:
            print(f"[InnerTube Next Error]: {e}", file=sys.stderr)

    # 2. Score candidates: mood match = high priority
    matching = [c for c in candidates if c.get('mood') == mood]
    others = [c for c in candidates if c.get('mood') != mood]

    # 3. If fewer than 12 matches of the requested mood, execute targeted YouTube searches
    if len(matching) < 12:
        query_terms = []
        if artist and artist != 'YouTube Artist':
            query_terms.append(f"{artist} {mood} songs")
        query_terms.append(f"best {mood} songs hits")
        
        for q in query_terms:
            extra = search_youtube_innertube(q, limit=10) or search_youtube_invidious(q, limit=10)
            if extra:
                for t in extra:
                    vid = t.get('videoId')
                    if not vid or vid in seen_ids:
                        continue
                    dur = t.get('duration', 180)
                    if dur > 600 or (dur > 0 and dur < 30):
                        continue
                    seen_ids.add(vid)
                    t['mood'] = detect_mood(t['title'], t['artist'])
                    if t['mood'] == mood or mood in ('chill', 'romantic'):
                        matching.append(t)
                    else:
                        others.append(t)
            if len(matching) >= 15:
                break

    # Final ranked list: exact mood matches first, followed by compatible tracks (avoiding exact opposites)
    opposite_map = {
        "sad": ["happy", "energetic"],
        "happy": ["sad"],
        "chill": ["energetic"],
        "energetic": ["sad", "chill"],
        "romantic": []
    }
    forbidden = opposite_map.get(mood, [])
    filtered_others = [c for c in others if c.get('mood') not in forbidden]

    final_results = matching + filtered_others
    return final_results[:limit]


def resolve_youtube_audio_stream(video_id, force_refresh=False):
    if not video_id:
        return None

    if force_refresh:
        AUDIO_URL_CACHE.pop(video_id, None)
    elif video_id in AUDIO_URL_CACHE:
        entry = AUDIO_URL_CACHE[video_id]
        if isinstance(entry, tuple) and len(entry) == 2:
            url, ts = entry
            if time.time() - ts < 7200: # 2 hours valid
                return url
        elif isinstance(entry, str):
            return entry

    # Method 1: Industry-standard yt-dlp extractor (handles n-sig, poToken, adaptive audio, web & android signatures)
    yt_dlp_mod = None
    try:
        import yt_dlp as yt_dlp_mod
    except Exception:
        # Dynamically discover site-packages across macOS python installations (Anaconda, Homebrew, etc.)
        candidate_site_packages = [
            '/opt/anaconda3/lib/python3.13/site-packages',
            '/opt/anaconda3/lib/python3.12/site-packages',
            '/opt/anaconda3/lib/python3.11/site-packages',
            '/opt/homebrew/lib/python3.13/site-packages',
            '/opt/homebrew/lib/python3.12/site-packages',
            '/opt/homebrew/lib/python3.11/site-packages',
            '/usr/local/lib/python3.13/site-packages',
            '/usr/local/lib/python3.12/site-packages',
            '/usr/local/lib/python3.11/site-packages',
            '/Library/Frameworks/Python.framework/Versions/3.14/lib/python3.14/site-packages',
            '/Library/Frameworks/Python.framework/Versions/3.13/lib/python3.13/site-packages'
        ]
        for sp in candidate_site_packages:
            if os.path.exists(sp) and sp not in sys.path:
                sys.path.append(sp)
        try:
            import yt_dlp as yt_dlp_mod
        except Exception:
            yt_dlp_mod = None

    if yt_dlp_mod is not None:
        try:
            import shutil
            node_path = shutil.which('node') or ('/opt/homebrew/bin/node' if os.path.exists('/opt/homebrew/bin/node') else None)
            ydl_opts = {
                'format': 'bestaudio[ext=m4a]/bestaudio/best',
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
                'socket_timeout': 10,
                'nocheckcertificate': True,
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android_vr', 'tv_embedded', 'web']
                    }
                }
            }
            if node_path and os.path.exists(node_path):
                ydl_opts['js_runtimes'] = {'node': {'path': node_path}}

            with yt_dlp_mod.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                stream_url = info.get('url')
                if stream_url:
                    AUDIO_URL_CACHE[video_id] = (stream_url, time.time())
                    return stream_url
        except Exception as e:
            print(f"[yt-dlp module resolution error for {video_id}]: {e}", file=sys.stderr)

    # Method 1B: Standalone yt-dlp CLI binary fallback (e.g. if running under Python without yt-dlp package)
    try:
        import shutil, subprocess
        yt_cli = shutil.which('yt-dlp') or (
            '/opt/anaconda3/bin/yt-dlp' if os.path.exists('/opt/anaconda3/bin/yt-dlp') else None
        )
        if yt_cli:
            node_path = shutil.which('node') or ('/opt/homebrew/bin/node' if os.path.exists('/opt/homebrew/bin/node') else None)
            cmd = [
                yt_cli,
                '-g',
                '-f', 'bestaudio[ext=m4a]/bestaudio/best',
                '--socket-timeout', '10',
                '--no-check-certificate'
            ]
            if node_path and os.path.exists(node_path):
                cmd.extend(['--js-runtimes', f'node:{node_path}'])
            cmd.append(f"https://www.youtube.com/watch?v={video_id}")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=12)
            if proc.returncode == 0 and proc.stdout.strip():
                lines = [l.strip() for l in proc.stdout.strip().splitlines() if l.strip().startswith('http')]
                if lines:
                    stream_url = lines[0]
                    AUDIO_URL_CACHE[video_id] = (stream_url, time.time())
                    return stream_url
    except Exception as cli_err:
        print(f"[yt-dlp CLI resolution error for {video_id}]: {cli_err}", file=sys.stderr)

    return None

ARTWORK_COLOR_CACHE = {}

def extract_artwork_color(image_url):
    if not image_url or 'default-cover.svg' in image_url:
        return {
            "primary": "hsl(38, 92%, 56%)",
            "glow": "hsla(38, 92%, 56%, 0.42)",
            "glowSoft": "hsla(38, 92%, 56%, 0.16)",
            "hex": "#f59e0b"
        }
    
    if image_url in ARTWORK_COLOR_CACHE:
        return ARTWORK_COLOR_CACHE[image_url]

    try:
        from PIL import Image
        import io
        req = urllib.request.Request(image_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = resp.read()
        
        img = Image.open(io.BytesIO(data)).convert('RGB')
        w, h = img.size
        # Crop center 70% to eliminate YouTube black letterbox bars & watermarks
        img = img.crop((int(w * 0.15), int(h * 0.15), int(w * 0.85), int(h * 0.85)))
        img = img.resize((32, 32), Image.Resampling.LANCZOS)
        
        buckets = {}
        for r, g, b in img.getdata():
            total = r + g + b
            if total < 40 or total > 710:
                continue
            rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
            max_c = max(rf, gf, bf)
            min_c = min(rf, gf, bf)
            diff = max_c - min_c
            if diff < 0.08:
                continue
            l = (max_c + min_c) / 2.0
            s = diff / (2.0 - max_c - min_c) if l > 0.5 else diff / (max_c + min_c)
            if max_c == min_c:
                h = 0
            elif max_c == rf:
                h = (gf - bf) / diff + (6 if gf < bf else 0)
            elif max_c == gf:
                h = (bf - rf) / diff + 2
            else:
                h = (rf - gf) / diff + 4
            h = int(h * 60) % 360
            
            hue_bucket = (h // 25) * 25
            if hue_bucket not in buckets:
                buckets[hue_bucket] = {'count': 0, 'h': h, 's': s, 'l': l}
            buckets[hue_bucket]['count'] += 1
            buckets[hue_bucket]['s'] = max(buckets[hue_bucket]['s'], s)
            buckets[hue_bucket]['l'] = (buckets[hue_bucket]['l'] + l) / 2.0
            
        if buckets:
            scored = []
            for k, v in buckets.items():
                score = v['count'] * (v['s'] ** 1.3)
                scored.append((score, v))
            scored.sort(key=lambda x: x[0], reverse=True)
            best = scored[0][1]
            final_h = best['h']
            final_s = max(0.68, min(0.95, best['s']))
            final_l = max(0.52, min(0.66, best['l']))
        else:
            final_h = 38
            final_s = 0.90
            final_l = 0.56
            
        s_pct = round(final_s * 100)
        l_pct = round(final_l * 100)
        
        # Calculate hex
        c = (1 - abs(2 * final_l - 1)) * final_s
        x = c * (1 - abs(((final_h / 60) % 2) - 1))
        m = final_l - c / 2
        if 0 <= final_h < 60: r, g, b = c, x, 0
        elif 60 <= final_h < 120: r, g, b = x, c, 0
        elif 120 <= final_h < 180: r, g, b = 0, c, x
        elif 180 <= final_h < 240: r, g, b = 0, x, c
        elif 240 <= final_h < 300: r, g, b = x, 0, c
        else: r, g, b = c, 0, x
        r_hex = f"{round((r + m) * 255):02x}"
        g_hex = f"{round((g + m) * 255):02x}"
        b_hex = f"{round((b + m) * 255):02x}"
        
        result = {
            "primary": f"hsl({final_h}, {s_pct}%, {l_pct}%)",
            "glow": f"hsla({final_h}, {s_pct}%, {l_pct}%, 0.42)",
            "glowSoft": f"hsla({final_h}, {s_pct}%, {l_pct}%, 0.16)",
            "hex": f"#{r_hex}{g_hex}{b_hex}"
        }
        if len(ARTWORK_COLOR_CACHE) < 500:
            ARTWORK_COLOR_CACHE[image_url] = result
        return result
    except Exception:
        return {
            "primary": "hsl(38, 92%, 56%)",
            "glow": "hsla(38, 92%, 56%, 0.42)",
            "glowSoft": "hsla(38, 92%, 56%, 0.16)",
            "hex": "#f59e0b"
        }

class AuraMusicHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def get_auth_user(self):
        auth_header = self.headers.get('Authorization', '')
        token = None
        if auth_header.startswith('Bearer '):
            token = auth_header[7:].strip()
        else:
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            token = params.get('token', [None])[0]

        if not token or token not in ACTIVE_SESSIONS:
            return None
        user_id = ACTIVE_SESSIONS[token]
        users = load_users()
        return users.get(user_id)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Read JSON body
        content_len = int(self.headers.get('Content-Length', 0))
        body = {}
        if content_len > 0:
            try:
                body = json.loads(self.rfile.read(content_len).decode('utf-8'))
            except Exception:
                pass

        # 1. Register User
        if path == '/api/auth/register':
            username = body.get('username', '').strip()
            password = body.get('password', '').strip()
            email = body.get('email', '').strip()

            if not username or not password:
                self.send_json_response({"error": "Username and password are required"}, status=400)
                return

            if len(username) < 3:
                self.send_json_response({"error": "Username must be at least 3 characters"}, status=400)
                return

            if len(password) < 4:
                self.send_json_response({"error": "Password must be at least 4 characters"}, status=400)
                return

            users = load_users()
            for u in users.values():
                if u.get('username', '').lower() == username.lower():
                    self.send_json_response({"error": "Username already taken"}, status=409)
                    return

            user_id = 'user_' + uuid.uuid4().hex[:12]
            pw_hash, salt = hash_password(password)

            user = {
                "id": user_id,
                "username": username,
                "email": email,
                "password_hash": pw_hash,
                "salt": salt,
                "created_at": int(time.time()),
                "collection": {
                    "liked": [],
                    "playlists": [
                        {
                            "id": "pl_favorites",
                            "name": "My Favorites",
                            "description": "Your favorite tracks",
                            "createdAt": int(time.time() * 1000),
                            "tracks": []
                        }
                    ],
                    "recent": []
                }
            }

            users[user_id] = user
            save_users(users)

            # Issue session token
            token = uuid.uuid4().hex
            ACTIVE_SESSIONS[token] = user_id

            self.send_json_response({
                "message": "Account created successfully",
                "token": token,
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"]
                },
                "collection": user["collection"]
            })
            return

        # 2. Login User
        elif path == '/api/auth/login':
            username = body.get('username', '').strip()
            password = body.get('password', '').strip()

            if not username or not password:
                self.send_json_response({"error": "Username and password required"}, status=400)
                return

            users = load_users()
            target_user = None
            for u in users.values():
                if u.get('username', '').lower() == username.lower() or u.get('email', '').lower() == username.lower():
                    target_user = u
                    break

            if not target_user:
                self.send_json_response({"error": "Invalid username or password"}, status=401)
                return

            hashed, _ = hash_password(password, target_user.get('salt'))
            if hashed != target_user.get('password_hash'):
                self.send_json_response({"error": "Invalid username or password"}, status=401)
                return

            token = uuid.uuid4().hex
            ACTIVE_SESSIONS[token] = target_user["id"]

            self.send_json_response({
                "message": "Login successful",
                "token": token,
                "user": {
                    "id": target_user["id"],
                    "username": target_user["username"],
                    "email": target_user.get("email", ""),
                    "picture": target_user.get("picture", ""),
                    "authProvider": target_user.get("auth_provider", "local")
                },
                "collection": target_user.get("collection", {})
            })
            return

        # 2B. Google Sign-In & Verification (OAuth 2.0 / OpenID Connect)
        elif path == '/api/auth/google':
            credential = body.get('credential') or body.get('idToken')
            access_token = body.get('accessToken')

            if not credential and not access_token:
                self.send_json_response({"error": "Google authentication credential or access token is required"}, status=400)
                return

            google_user = verify_google_token(credential=credential, access_token=access_token)
            if not google_user:
                self.send_json_response({"error": "Invalid, expired, or unverified Google token. Please try again."}, status=401)
                return

            google_id = google_user["sub"]
            email = google_user["email"]
            name = google_user["name"]
            picture = google_user["picture"]

            users = load_users()
            target_user = None

            # Primary match: stable Google user ID (sub)
            for u in users.values():
                if u.get('google_id') == google_id:
                    target_user = u
                    break

            # Secondary match: verified email address
            if not target_user and email:
                for u in users.values():
                    if u.get('email', '').lower() == email:
                        target_user = u
                        break

            if target_user:
                # Existing user - update profile info & link google_id
                target_user['google_id'] = google_id
                target_user['auth_provider'] = 'google'
                if name and (not target_user.get('username') or target_user.get('username') == target_user.get('email', '').split('@')[0]):
                    target_user['username'] = name
                if picture:
                    target_user['picture'] = picture
                user = target_user
            else:
                # New user - automatically create AppleTube account
                user_id = f"user_g_{google_id}"
                user = {
                    "id": user_id,
                    "username": name,
                    "email": email,
                    "picture": picture,
                    "google_id": google_id,
                    "auth_provider": "google",
                    "created_at": int(time.time()),
                    "collection": {
                        "liked": [],
                        "playlists": [
                            {
                                "id": "pl_favorites",
                                "name": "My Favorites",
                                "description": "Your favorite tracks",
                                "createdAt": int(time.time() * 1000),
                                "tracks": []
                            }
                        ],
                        "recent": []
                    }
                }
                users[user_id] = user

            save_users(users)

            token = uuid.uuid4().hex
            ACTIVE_SESSIONS[token] = user["id"]

            self.send_json_response({
                "message": "Authenticated with Google successfully",
                "token": token,
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "picture": user.get("picture", ""),
                    "authProvider": "google"
                },
                "collection": user.get("collection", {})
            })
            return

        # 3. Sync User Collection
        elif path == '/api/user/collection':
            user = self.get_auth_user()
            if not user:
                self.send_json_response({"error": "Unauthorized"}, status=401)
                return

            collection = body.get('collection')
            if isinstance(collection, dict):
                users = load_users()
                if user["id"] in users:
                    users[user["id"]]["collection"] = collection
                    save_users(users)
                self.send_json_response({"message": "Collection synchronized successfully"})
            else:
                self.send_json_response({"error": "Invalid collection data"}, status=400)
            return

        # 4. Logout
        elif path == '/api/auth/logout':
            auth_header = self.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                t = auth_header[7:].strip()
                ACTIVE_SESSIONS.pop(t, None)
            self.send_json_response({"message": "Logged out successfully"})
            return

        self.send_error(404, "Endpoint not found")

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path == '/api/yt/audio':
            video_id = params.get('id', [''])[0].strip()
            if not video_id:
                self.send_error(400, "Missing video id parameter")
                return
            stream_url = resolve_youtube_audio_stream(video_id)
            if not stream_url:
                self.send_error(503, "Audio stream unavailable")
                return
            content_length = None
            content_type = 'audio/mp4'
            try:
                if HTTP_SESSION is not None:
                    head_res = HTTP_SESSION.head(stream_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=2.0)
                    if head_res.status_code < 400:
                        content_length = head_res.headers.get('Content-Length')
                        content_type = head_res.headers.get('Content-Type', 'audio/mp4')
                else:
                    head_req = urllib.request.Request(stream_url, headers={"User-Agent": "Mozilla/5.0"}, method='HEAD')
                    with urllib.request.urlopen(head_req, timeout=2.0) as resp:
                        content_length = resp.headers.get('Content-Length')
                        content_type = resp.headers.get('Content-Type', 'audio/mp4')
            except Exception:
                pass

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            if content_length:
                self.send_header('Content-Length', content_length)
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')
            self.end_headers()
            return
        elif path.startswith('/api/'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            return

        return super().do_HEAD()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        # 1. API: Get Current Authenticated User & Collection
        if path == '/api/auth/me':
            user = self.get_auth_user()
            if not user:
                self.send_json_response({"error": "Unauthorized"}, status=401)
                return
            self.send_json_response({
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user.get("email", ""),
                    "phone": user.get("phone", ""),
                    "picture": user.get("picture", ""),
                    "authProvider": user.get("auth_provider", "local")
                },
                "collection": user.get("collection", {})
            })
            return

        # 1B. API: Public Auth Configuration
        elif path == '/api/auth/config':
            self.send_json_response({
                "googleClientId": GOOGLE_CLIENT_ID
            })
            return

        # 2. API: Live YouTube Database Search
        elif path == '/api/yt/search':
            query = params.get('q', [''])[0].strip()
            limit = int(params.get('limit', [30])[0])
            if not query:
                self.send_json_response([])
                return

            cache_key = query.lower()
            cached_res = get_from_cache(SEARCH_CACHE, SEARCH_CACHE_LOCK, cache_key, SEARCH_CACHE_TTL)
            if cached_res is not None:
                self.send_json_response(cached_res[:limit])
                return

            results = search_youtube_innertube(query, limit)
            if not results:
                results = search_youtube_invidious(query, limit)

            if results:
                set_in_cache(SEARCH_CACHE, SEARCH_CACHE_LOCK, cache_key, results, SEARCH_CACHE_MAX)

            self.send_json_response(results or [])
            return

        # 2B. API: Live YouTube Suggestions & Fast Song Previews
        elif path == '/api/yt/suggestions':
            query = params.get('q', [''])[0].strip()
            limit = int(params.get('limit', [8])[0])
            if not query:
                self.send_json_response({"query": "", "suggestions": [], "songs": []})
                return

            data = get_youtube_suggestions(query, limit)
            self.send_json_response(data)
            return

        # 3. API: Live YouTube Trending
        elif path == '/api/yt/trending':
            trending = get_youtube_trending()
            self.send_json_response(trending or [])
            return

        # 3B. API: Live YouTube Related & Mood-Matched Next Tracks
        elif path == '/api/yt/related':
            video_id = params.get('id', [''])[0].strip()
            mood = params.get('mood', [''])[0].strip()
            title = params.get('title', [''])[0].strip()
            artist = params.get('artist', [''])[0].strip()
            limit = int(params.get('limit', [20])[0])

            if not mood:
                mood = detect_mood(title, artist)

            results = get_youtube_related(video_id=video_id, mood=mood, current_title=title, artist=artist, limit=limit)
            self.send_json_response({
                "mood": mood,
                "tracks": results or []
            })
            return

        # 3C. API: Artwork Dominant Color Extractor
        elif path == '/api/yt/artwork-color':
            url = params.get('url', [''])[0].strip()
            if not url:
                self.send_json_response({"primary": "hsl(38, 92%, 56%)", "glow": "hsla(38, 92%, 56%, 0.42)", "glowSoft": "hsla(38, 92%, 56%, 0.16)", "hex": "#f59e0b"})
                return
            colors = extract_artwork_color(url)
            self.send_json_response(colors)
            return

        # 4. API: High-Performance Direct Audio Streamer & File Downloader
        elif path == '/api/yt/audio':
            video_id = params.get('id', [''])[0].strip()
            is_download = params.get('download', ['0'])[0] == '1'
            title = params.get('title', ['track'])[0]
            artist = params.get('artist', ['artist'])[0]
            force_refresh = params.get('retry', ['0'])[0] == '1'

            if not video_id:
                self.send_error(400, "Missing video id parameter")
                return

            stream_url = resolve_youtube_audio_stream(video_id, force_refresh=force_refresh)
            if not stream_url:
                self.send_json_response({"error": "Audio stream unavailable for this track"}, status=503)
                return

            def stream_data(target_url, attempt=1):
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                }
                if 'Range' in self.headers and not is_download:
                    headers['Range'] = self.headers['Range']

                proxy_req = urllib.request.Request(target_url, headers=headers)
                try:
                    with urllib.request.urlopen(proxy_req, timeout=12) as remote_stream:
                        status_code = remote_stream.status
                        self.send_response(status_code)
                        
                        raw_content_type = remote_stream.headers.get('Content-Type', '')
                        if 'm3u8' in target_url or 'hls' in target_url:
                            content_type = 'application/vnd.apple.mpegurl'
                        elif raw_content_type:
                            content_type = raw_content_type
                        else:
                            content_type = 'audio/mp4'

                        self.send_header('Content-Type', content_type)
                        
                        if 'Content-Length' in remote_stream.headers:
                            self.send_header('Content-Length', remote_stream.headers['Content-Length'])
                        if 'Content-Range' in remote_stream.headers and not is_download:
                            self.send_header('Content-Range', remote_stream.headers['Content-Range'])
                        
                        self.send_header('Accept-Ranges', 'bytes')
                        self.send_header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')

                        # If download requested, set attachment header
                        if is_download:
                            safe_filename = sanitize_filename(f"{artist} - {title}.m4a")
                            self.send_header('Content-Disposition', f'attachment; filename="{safe_filename}"')

                        self.end_headers()

                        # Stream audio in 64KB chunks
                        while True:
                            chunk = remote_stream.read(64 * 1024)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                except urllib.error.HTTPError as http_err:
                    if attempt == 1 and http_err.code in (403, 410, 404):
                        print(f"[Audio Stream Expired/{http_err.code} for {video_id}], refreshing cache...", file=sys.stderr)
                        AUDIO_URL_CACHE.pop(video_id, None)
                        fresh_url = resolve_youtube_audio_stream(video_id, force_refresh=True)
                        if fresh_url and fresh_url != target_url:
                            return stream_data(fresh_url, attempt=2)
                    raise
                except Exception as e:
                    if attempt == 1:
                        print(f"[Audio Stream connect error for {video_id}]: {e}, trying fresh stream...", file=sys.stderr)
                        AUDIO_URL_CACHE.pop(video_id, None)
                        fresh_url = resolve_youtube_audio_stream(video_id, force_refresh=True)
                        if fresh_url and fresh_url != target_url:
                            return stream_data(fresh_url, attempt=2)
                    raise

            try:
                stream_data(stream_url)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as err:
                print(f"[Audio Stream Error for {video_id}]: {err}", file=sys.stderr)
                try:
                    self.send_json_response({"error": "Audio stream failed upstream"}, status=503)
                except Exception:
                    pass
                    self.send_error(502, "Error streaming audio")
            return

        # 5. API: Server Status Check
        elif path == '/api/status':
            self.send_json_response({
                "status": "online",
                "database": "YouTube Live InnerTube",
                "auth": "Enabled",
                "version": "1.4.0"
            })
            return

        # Default: Serve static web files
        return super().do_GET()

    def send_json_response(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

def prewarm_popular_searches():
    """Asynchronously pre-warm search cache for common searches and trending tracks."""
    time.sleep(1.0)
    try:
        get_youtube_trending()
    except Exception:
        pass
    popular = [
        "arijit singh", "taylor swift", "lofi chill",
        "bollywood hits", "punjabi top hits"
    ]
    for q in popular:
        try:
            cache_key = q.lower()
            if not get_from_cache(SEARCH_CACHE, SEARCH_CACHE_LOCK, cache_key, SEARCH_CACHE_TTL):
                res = search_youtube_innertube(q, limit=15)
                if res:
                    set_in_cache(SEARCH_CACHE, SEARCH_CACHE_LOCK, cache_key, res, SEARCH_CACHE_MAX)
            time.sleep(0.4)
        except Exception:
            pass


def find_available_port(start_port, host='0.0.0.0', max_tries=20):
    """Return the first free port starting from start_port."""
    port = int(start_port)
    for i in range(max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((host, port))
                return port
            except OSError:
                port += 1
    raise RuntimeError(f"No free port found starting from {start_port}.")


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    requested_port = PORT
    try:
        PORT = find_available_port(PORT)
        if PORT != requested_port:
            print(f"[INFO] Port {requested_port} is already in use. Using port {PORT} instead.", flush=True)
    except RuntimeError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr, flush=True)
        raise

    server = ThreadingHTTPServer(('0.0.0.0', PORT), AuraMusicHandler)
    print(f"🎵 AppleTube Live Server running on port {PORT} with Apple Music Interface...")
    
    # Launch background pre-warming thread
    threading.Thread(target=prewarm_popular_searches, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping AppleTube Server...")
        server.server_close()
