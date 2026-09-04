"""
Install the SMARTLink packages on a router over its LuCI session, without ssh.

    python scripts/deploy_ubus.py 192.168.20.1 [password]

Why this exists: ssh is not always available. A vendor image may ship dropbear
configured to refuse the account's empty password, and some LuCI builds cannot
render their own package-manager page. A logged-in LuCI session, however, is
granted exactly two things that are enough to install a package:

    /tmp/upload.ipk                     write
    /usr/libexec/opkg-call install *    exec

So: authenticate the way the browser does, push each .ipk into that one
permitted path, and ask opkg to install it. Nothing persistent is added to the
router - no key, no account, no service.
"""

import base64
import io
import json
import pathlib
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACKAGES = ROOT / "packages"

UPLOAD_PATH = "/tmp/upload.ipk"

# Raw bytes per request; base64 inflates this by a third and uhttpd's ubus
# handler rejects bodies beyond roughly 64 KB.
CHUNK = 24 * 1024

UBUS_STATUS = {
    0: "ok",
    1: "invalid command",
    2: "invalid argument",
    3: "method not found",
    4: "not found",
    5: "no data",
    6: "permission denied",
    7: "timeout",
    8: "not supported",
    9: "unspecified error",
    10: "connection lost",
}


class Router:
    def __init__(self, host):
        self.host = host
        self.session = None
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor()
        )

    # ---------------------------------------------------------------- auth

    def login(self, password=""):
        """Authenticate the same way the login form does, then read the
        session id back out of the cookie jar."""
        body = urllib.parse.urlencode(
            {"luci_username": "root", "luci_password": password}
        ).encode()

        req = urllib.request.Request(
            "http://%s/cgi-bin/luci/" % self.host,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        self.opener.open(req, timeout=30).read()

        jar = None
        for h in self.opener.handlers:
            if isinstance(h, urllib.request.HTTPCookieProcessor):
                jar = h.cookiejar

        for c in jar or []:
            if c.name.startswith("sysauth"):
                self.session = c.value
                return True

        return False

    # ---------------------------------------------------------------- ubus

    def call(self, obj, method, params=None):
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "call",
            "params": [self.session, obj, method, params or {}],
        }

        req = urllib.request.Request(
            "http://%s/ubus/" % self.host,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )

        reply = json.loads(self.opener.open(req, timeout=120).read().decode())

        if "error" in reply:
            raise RuntimeError("ubus error: %s" % reply["error"].get("message"))

        result = reply.get("result")

        if not isinstance(result, list):
            raise RuntimeError("unexpected reply: %r" % reply)

        status = result[0]

        if status != 0:
            raise RuntimeError(
                "%s.%s -> %s" % (obj, method, UBUS_STATUS.get(status, status))
            )

        return result[1] if len(result) > 1 else {}

    # ------------------------------------------------------------- install

    def upload(self, blob, path):
        """uhttpd caps the size of a single ubus POST body, so the package is
        pushed in chunks: the first truncates the target, the rest append."""
        total = len(blob)
        sent = 0
        first = True

        while sent < total:
            piece = blob[sent:sent + CHUNK]

            self.call(
                "file",
                "write",
                {
                    "path": path,
                    "data": base64.b64encode(piece).decode(),
                    "base64": True,
                    "append": not first,
                    "mode": 0o600,
                },
            )

            sent += len(piece)
            first = False
            print("    %d%% uploaded" % (100 * sent // total))

        print("    uploaded %d bytes    " % total)

        landed = self.call("file", "stat", {"path": path}).get("size")

        if landed != total:
            raise RuntimeError(
                "upload truncated: router has %s of %d bytes" % (landed, total)
            )

    @staticmethod
    def probe_file(ipk):
        """The largest file the package ships, as (install path, size).

        A package name in `opkg list-installed` is formatted differently across
        builds; a file's size on disk is unambiguous and proves the payload
        actually landed, which is what we care about.
        """
        with tarfile.open(ipk, "r:gz") as outer:
            data = outer.extractfile("./data.tar.gz").read()

        best = None

        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as inner:
            for m in inner.getmembers():
                if m.isfile() and (best is None or m.size > best.size):
                    best = m

        return ("/" + best.name.lstrip("./"), best.size)

    def await_installed(self, ipk, deadline=180):
        """Wait until the package's largest file is on disk at the right size."""
        path, size = self.probe_file(ipk)
        start = time.time()

        while time.time() - start < deadline:
            time.sleep(5)

            try:
                landed = self.call("file", "stat", {"path": path}).get("size")
            except RuntimeError:
                continue

            if landed == size:
                print("    installed (%s is %d bytes)" % (path.split("/")[-1], size))
                return

        raise RuntimeError(
            "%s did not finish within %ds (%s)" % (ipk.name, deadline, path)
        )

    def install(self, ipk):
        blob = ipk.read_bytes()

        print("  uploading %s (%d bytes)" % (ipk.name, len(blob)))
        self.upload(blob, UPLOAD_PATH)

        print("  installing")

        try:
            out = self.call(
                "file",
                "exec",
                {
                    "command": "/usr/libexec/opkg-call",
                    "params": ["install", "--force-reinstall", UPLOAD_PATH],
                },
            )
        except RuntimeError as err:
            # ubus gives up on a call after 30s; opkg on a slow flash can take
            # longer than that. The install is still running on the router, so
            # wait for the package to appear rather than declaring failure.
            if "timed out" not in str(err):
                raise

            print("    (ubus timed out; waiting for opkg to finish)")
            self.await_installed(ipk)
            return

        for line in (out.get("stdout") or "").splitlines():
            print("    " + line)

        stderr = (out.get("stderr") or "").strip()

        if stderr:
            for line in stderr.splitlines():
                print("    ! " + line)

        if out.get("code"):
            raise RuntimeError("opkg exited with %s" % out["code"])


def main():
    host = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.1"
    password = sys.argv[2] if len(sys.argv) > 2 else ""

    ipks = sorted(PACKAGES.glob("*.ipk"))

    # The theme carries the templates the app's pages are rendered into, so it
    # goes first; a half-installed pair should still leave a usable interface.
    ipks.sort(key=lambda p: 0 if "theme" in p.name else 1)

    if not ipks:
        sys.exit("no packages in %s - run scripts/build_ipk.py first" % PACKAGES)

    print("==> target: %s" % host)

    r = Router(host)

    if not r.login(password):
        sys.exit(
            "could not authenticate. If root has a password, pass it as the "
            "second argument."
        )

    print("==> session established")

    for ipk in ipks:
        r.install(ipk)

    board = r.call("system", "board")
    print("\n==> done on %s (%s)" % (board.get("hostname"), board.get("model")))
    print("    open http://%s/cgi-bin/luci/" % host)


if __name__ == "__main__":
    main()
