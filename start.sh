#!/usr/bin/env bash
# AppleTube - Quick Launch & Live YouTube Server Script

PORT="${PORT:-3000}"
export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-478691904536-p5mjbadl4bcjusu6ou4jg0e99q4kcfse.apps.googleusercontent.com}"
FREE_PORT=$(python3 - "$PORT" <<'PY'
import socket, sys
start = int(sys.argv[1])
port = start
for _ in range(20):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(('0.0.0.0', port))
            print(port)
            raise SystemExit
        except OSError:
            port += 1
print(start)
PY
)
PORT="$FREE_PORT"
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo "========================================================"
echo "🎵 AppleTube — Live Music & Android Background Audio"
echo "========================================================"
echo "💻 Computer Browser:  http://localhost:$PORT"
if [ "$IP" != "localhost" ]; then
echo "📱 Android Phone:     http://$IP:$PORT"
echo "👉 Open the Android Phone URL in Chrome to install AppleTube!"
fi
echo "========================================================"

# Auto-open browser on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
  (sleep 1 && open "http://localhost:$PORT") &
fi

# Determine modern Python binary with yt-dlp support
if [ -x "/opt/anaconda3/bin/python3" ]; then
  PYTHON_BIN="/opt/anaconda3/bin/python3"
elif [ -x "/opt/homebrew/bin/python3" ]; then
  PYTHON_BIN="/opt/homebrew/bin/python3"
else
  PYTHON_BIN="$(which python3)"
fi

# Run live YouTube server bound to 0.0.0.0
"$PYTHON_BIN" server.py "$PORT"
