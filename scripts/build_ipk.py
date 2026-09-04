"""
Build installable .ipk packages for the SMARTLink theme and app.

opkg accepts two container formats; this writes the tar.gz one (a gzipped tar
holding ./debian-binary, ./control.tar.gz and ./data.tar.gz), which needs no
`ar` binary and so builds identically on Windows, Linux and macOS.

Both packages are architecture-independent, so no OpenWrt SDK or toolchain is
involved - the same files an SDK build would install are simply packed here.

    python scripts/build_ipk.py            # writes dist/*.ipk
"""

import gzip
import io
import pathlib
import shutil
import tarfile
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

VERSION = "1.2.3-1"
MAINTAINER = "Alagha Technology"

THEME_POSTINST = """#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] && exit 0

# Register the theme and make it the active one on a fresh install.
[ -f /etc/uci-defaults/30_luci-theme-smartlink ] && {
	( . /etc/uci-defaults/30_luci-theme-smartlink ) >/dev/null 2>&1
	rm -f /etc/uci-defaults/30_luci-theme-smartlink
}

rm -f /tmp/luci-indexcache* 2>/dev/null
rm -rf /tmp/luci-modulecache 2>/dev/null
exit 0
"""

THEME_POSTRM = """#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] && exit 0

# opkg runs the OLD package's postrm during an upgrade. Without this
# guard every update would switch the user off the theme and drop its
# registration, which is not what "remove" means here.
[ "$PKG_UPGRADE" = "1" ] && exit 0

# Fall back to a theme that is still installed.
if [ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/smartlink" ]; then
	for t in bootstrap argon openwrt2020; do
		[ -d "/www/luci-static/$t" ] && {
			uci set luci.main.mediaurlbase="/luci-static/$t"
			break
		}
	done
fi

uci -q delete luci.themes.SMARTLink
uci commit luci
rm -f /tmp/luci-indexcache* 2>/dev/null
exit 0
"""

APP_POSTINST = """#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] && exit 0

rm -f /tmp/luci-indexcache* 2>/dev/null
rm -rf /tmp/luci-modulecache 2>/dev/null
/etc/init.d/rpcd reload >/dev/null 2>&1
exit 0
"""

APP_POSTRM = """#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] && exit 0

# opkg runs the OLD package's postrm during an upgrade. Without this
# guard every update would switch the user off the theme and drop its
# registration, which is not what "remove" means here.
[ "$PKG_UPGRADE" = "1" ] && exit 0

rm -f /tmp/luci-indexcache* 2>/dev/null
/etc/init.d/rpcd reload >/dev/null 2>&1
exit 0
"""

PACKAGES = [
    {
        "name": "luci-theme-smartlink",
        "depends": "luci-base",
        "description": "SMARTLink theme for LuCI - RTL-aware, light and dark.",
        "source": ROOT / "luci-theme-smartlink",
        "layout": [
            ("htdocs/luci-static/smartlink", "www/luci-static/smartlink"),
            ("htdocs/luci-static/resources/menu-smartlink.js", "www/luci-static/resources/menu-smartlink.js"),
            ("htdocs/luci-static/resources/view/smartlink/sysauth.js", "www/luci-static/resources/view/smartlink/sysauth.js"),
            ("ucode/template/themes/smartlink", "usr/share/ucode/luci/template/themes/smartlink"),
            ("root/etc/uci-defaults/30_luci-theme-smartlink", "etc/uci-defaults/30_luci-theme-smartlink"),
        ],
        "postinst": THEME_POSTINST,
        "postrm": THEME_POSTRM,
        "executable": [ "etc/uci-defaults/30_luci-theme-smartlink" ],
    },
    {
        "name": "luci-app-smartlink",
        "depends": "luci-base, luci-theme-smartlink, rpcd-mod-luci, rpcd-mod-file, rpcd-mod-iwinfo",
        "description": "SMARTLink interface - dashboard, devices, wireless, LAN, internet, setup wizard.",
        "source": ROOT / "luci-app-smartlink",
        "layout": [
            ("htdocs/luci-static/resources/smartlink", "www/luci-static/resources/smartlink"),
            ("htdocs/luci-static/resources/view/smartlink", "www/luci-static/resources/view/smartlink"),
            ("root/usr/share/luci/menu.d/luci-app-smartlink.json", "usr/share/luci/menu.d/luci-app-smartlink.json"),
            ("root/usr/share/rpcd/acl.d/luci-app-smartlink.json", "usr/share/rpcd/acl.d/luci-app-smartlink.json"),
        ],
        "postinst": APP_POSTINST,
        "postrm": APP_POSTRM,
        "executable": [],
    },
]


def add_dir(tar, name, seen):
    """Emit a directory entry, and every ancestor, exactly once.

    opkg extracts members in order and does not create missing parents, so a
    payload that lists only files installs nothing but "wfopen: no such file
    or directory" errors.
    """
    parts = name.strip("/").split("/")

    for i in range(1, len(parts) + 1):
        path = "/".join(parts[:i])

        if path in seen:
            continue

        seen.add(path)

        info = tarfile.TarInfo("./" + path + "/")
        info.type = tarfile.DIRTYPE
        info.mode = 0o755
        info.mtime = int(time.time())
        info.uid = info.gid = 0
        info.uname = info.gname = "root"
        tar.addfile(info)


def add_tree(tar, src: pathlib.Path, arcname: str, executable, seen):
    """Add a file or directory with root ownership and predictable modes."""
    entries = []

    if src.is_dir():
        add_dir(tar, arcname, seen)

        for path in sorted(src.rglob("*")):
            rel = path.relative_to(src).as_posix()
            target = "%s/%s" % (arcname, rel)

            if path.is_dir():
                add_dir(tar, target, seen)
            else:
                entries.append((path, target))
    else:
        parent = arcname.rsplit("/", 1)[0]

        if parent != arcname:
            add_dir(tar, parent, seen)

        entries.append((src, arcname))

    for path, name in entries:
        info = tarfile.TarInfo("./" + name)
        info.size = path.stat().st_size
        info.mode = 0o755 if name in executable else 0o644
        info.mtime = int(time.time())
        info.uid = info.gid = 0
        info.uname = info.gname = "root"

        with open(path, "rb") as fh:
            tar.addfile(info, fh)


def make_member(tar, name, content: bytes, mode=0o644):
    info = tarfile.TarInfo("./" + name)
    info.size = len(content)
    info.mode = mode
    info.mtime = int(time.time())
    info.uid = info.gid = 0
    info.uname = info.gname = "root"
    tar.addfile(info, io.BytesIO(content))


def gz_tar(build) -> bytes:
    """Return a gzipped tar built by the callback."""
    raw = io.BytesIO()

    with tarfile.open(fileobj=raw, mode="w", format=tarfile.GNU_FORMAT) as tar:
        build(tar)

    out = io.BytesIO()

    with gzip.GzipFile(fileobj=out, mode="wb", mtime=0) as gz:
        gz.write(raw.getvalue())

    return out.getvalue()


def build(pkg):
    src = pkg["source"]

    missing = [s for s, _d in pkg["layout"] if not (src / s).exists()]
    if missing:
        raise SystemExit("%s: missing %s" % (pkg["name"], ", ".join(missing)))

    def payload(tar):
        seen = set()

        for rel, dest in pkg["layout"]:
            add_tree(tar, src / rel, dest, pkg["executable"], seen)

    data = gz_tar(payload)

    installed = len(data)

    control_text = (
        "Package: %s\n"
        "Version: %s\n"
        "Depends: %s\n"
        "Section: luci\n"
        "Category: LuCI\n"
        "Architecture: all\n"
        "Installed-Size: %d\n"
        "Maintainer: %s\n"
        "Description: %s\n"
    ) % (pkg["name"], VERSION, pkg["depends"], installed, MAINTAINER, pkg["description"])

    def control_members(tar):
        make_member(tar, "control", control_text.encode())
        make_member(tar, "postinst", pkg["postinst"].encode(), 0o755)
        make_member(tar, "postrm", pkg["postrm"].encode(), 0o755)

    control = gz_tar(control_members)

    def outer(tar):
        make_member(tar, "debian-binary", b"2.0\n")
        make_member(tar, "control.tar.gz", control)
        make_member(tar, "data.tar.gz", data)

    ipk = gz_tar(outer)
    path = DIST / ("%s_%s_all.ipk" % (pkg["name"], VERSION))
    path.write_bytes(ipk)

    print("%-24s %7d bytes  (payload %d bytes)" % (path.name, len(ipk), installed))


def main():
    if DIST.exists():
        shutil.rmtree(DIST)

    DIST.mkdir(parents=True)

    for pkg in PACKAGES:
        build(pkg)

    print("\nInstall on a router with:")
    print("  scp dist/*.ipk root@192.168.1.1:/tmp/")
    print("  ssh root@192.168.1.1 'opkg install /tmp/luci-theme-smartlink_%s_all.ipk /tmp/luci-app-smartlink_%s_all.ipk'"
          % (VERSION, VERSION))


if __name__ == "__main__":
    main()
