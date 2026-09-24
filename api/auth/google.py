import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler

from api._youtube import json_response


GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip() or "478691904536-p5mjbadl4bcjusu6ou4jg0e99q4kcfse.apps.googleusercontent.com"


def google_request(url):
    request = urllib.request.Request(url, headers={"User-Agent": "AppleTube-Auth/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        print(f"[AUTH ERROR] Google verification failed: HTTP {error.code}: {error_body}", flush=True)
        return None
    except Exception as error:
        print(f"[AUTH ERROR] Google verification failed: {error}", flush=True)
        return None


def verify_google_token(credential=None, access_token=None):
    if credential:
        url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + urllib.parse.quote(credential)
    elif access_token:
        url = "https://oauth2.googleapis.com/tokeninfo?access_token=" + urllib.parse.quote(access_token)
    else:
        return None

    claims = google_request(url)
    if not claims:
        return None

    audience = claims.get("aud")
    if audience != GOOGLE_CLIENT_ID:
        print(
            f"[AUTH ERROR] Google token audience mismatch: received={audience!r}, expected={GOOGLE_CLIENT_ID!r}",
            flush=True,
        )
        return None

    email = str(claims.get("email") or "").lower().strip()
    subject = str(claims.get("sub") or "").strip()
    if not subject or not email:
        print("[AUTH ERROR] Google token missing required sub or email claims", flush=True)
        return None

    email_verified = claims.get("email_verified")
    if email_verified not in (True, "true", "True", 1, "1"):
        print(f"[AUTH ERROR] Google token email is not verified: email_verified={email_verified!r}", flush=True)
        return None

    return {
        "sub": subject,
        "email": email,
        "name": str(claims.get("name") or email.split("@")[0]).strip(),
        "picture": str(claims.get("picture") or "").strip(),
    }


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            print(f"[AUTH ERROR] Invalid Google auth request body: {error}", flush=True)
            json_response(self, {"error": "Invalid request body"}, status=400, cache_control="no-store")
            return

        credential = body.get("credential") or body.get("idToken")
        access_token = body.get("accessToken")
        if not credential and not access_token:
            json_response(self, {"error": "Google authentication credential or access token is required"}, status=400, cache_control="no-store")
            return

        user = verify_google_token(credential=credential, access_token=access_token)
        if not user:
            json_response(self, {"error": "Invalid, expired, or unverified Google token. Please try again."}, status=401, cache_control="no-store")
            return

        json_response(
            self,
            {
                "message": "Authenticated with Google successfully",
                "token": uuid.uuid4().hex,
                "user": {
                    "id": f"user_g_{user['sub']}",
                    "username": user["name"],
                    "email": user["email"],
                    "picture": user["picture"],
                    "authProvider": "google",
                },
                "collection": {"liked": [], "playlists": [], "recent": []},
                "authenticatedAt": int(time.time()),
            },
            status=200,
            cache_control="no-store",
        )

    def do_OPTIONS(self):
        json_response(self, {})
