#!/usr/bin/env python3
"""Static file server with HTTP Range support, needed by PMTiles."""
import os
import re
import sys
import http.server
import socketserver

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8867
DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class RangeHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().do_GET()
        m = re.match(r"bytes=(\d+)-(\d*)", rng)
        if not m:
            return super().do_GET()
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.send_error(404)
            return
        size = os.path.getsize(path)
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else size - 1
        if start >= size or end >= size:
            self.send_error(416)
            return
        length = end - start + 1
        ctype = self.guess_type(path)
        self.send_response(206)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(65536, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    with ThreadedServer(("", PORT), RangeHandler) as httpd:
        print(f"serving {DIR} on http://localhost:{PORT}")
        httpd.serve_forever()
