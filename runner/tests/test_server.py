"""The brief server on 127.0.0.1: it answers the app, and nothing that only pretends to be
loopback (DNS rebinding)."""

from __future__ import annotations

import http.client
import threading
import unittest
from http.server import ThreadingHTTPServer

from support import FRESH_FIXTURE, FolderCase

from daybook.server import make_handler


class BriefServer(FolderCase):
    fixture = FRESH_FIXTURE

    def setUp(self) -> None:
        super().setUp()
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(str(self.folder), "2026-03-10T08:00:00"))
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)

    def get(self, path: str, host: str) -> tuple[int, bytes]:
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.putrequest("GET", path, skip_host=True)
        conn.putheader("Host", host)
        conn.endheaders()
        response = conn.getresponse()
        body = response.read()
        conn.close()
        return response.status, body

    def test_the_app_gets_the_brief(self):
        status, body = self.get("/api/brief", f"127.0.0.1:{self.port}")
        self.assertEqual(200, status)
        self.assertIn(b"verification", body)

    def test_a_website_rebinding_its_name_to_loopback_is_refused(self):
        status, body = self.get("/api/brief", f"rebind.example:{self.port}")
        self.assertEqual(403, status)
        self.assertNotIn(str(self.folder).encode(), body)


if __name__ == "__main__":
    unittest.main()
