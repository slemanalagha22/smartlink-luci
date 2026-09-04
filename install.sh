#!/bin/sh
#
# SMARTLink for OpenWrt - one-command installer.
#
#   wget -O - https://cdn.jsdelivr.net/gh/slemanalagha22/smartlink-luci@main/install.sh | sh
#
# Downloads both packages and installs them. Safe to re-run: opkg upgrades in
# place, and the theme keeps whatever colour scheme the browser had chosen.

set -e

# Where to fetch the packages from, tried in order.
#
# raw.githubusercontent.com is unreachable on a number of networks - it is
# resolved but never answers - so the script does not depend on any single
# host. jsDelivr mirrors the same repository and is reachable where raw is
# not; both are tried before giving up.
#
# SMARTLINK_BASE overrides the list entirely, for a local mirror or a build
# machine on the LAN when the router has no internet yet.
REPO="slemanalagha22/smartlink-luci"

if [ -n "$SMARTLINK_BASE" ]; then
	MIRRORS="$SMARTLINK_BASE"
else
	MIRRORS="https://cdn.jsdelivr.net/gh/$REPO@main/packages
https://raw.githubusercontent.com/$REPO/main/packages"
fi
VERSION="1.2.5-1"
TMP="/tmp/smartlink-install"

THEME="luci-theme-smartlink_${VERSION}_all.ipk"
APP="luci-app-smartlink_${VERSION}_all.ipk"

say() { echo "==> $*"; }
die() { echo "!!  $*" >&2; exit 1; }

# ---------------------------------------------------------------- checks ---

[ "$(id -u)" = "0" ] || die "run as root"

command -v opkg >/dev/null 2>&1 || die "opkg not found - this is not an OpenWrt system"

if [ ! -d /usr/share/ucode/luci/template/themes ]; then
	die "this LuCI is too old (no ucode templates). SMARTLink needs OpenWrt 21.02 or newer."
fi

# ------------------------------------------------------------- download ---

mkdir -p "$TMP"
cd "$TMP"

# One attempt at one URL, with the fallbacks a stock image needs: uclient-fetch
# cannot verify certificates unless ca-bundle is installed.
try_url() {
	url="$1"
	out="$2"

	if command -v curl >/dev/null 2>&1; then
		curl -fsSL --connect-timeout 15 --max-time 180 "$url" -o "$out" 2>/dev/null && [ -s "$out" ] && return 0
	fi

	wget -q -O "$out" "$url" 2>/dev/null && [ -s "$out" ] && return 0
	wget -q --no-check-certificate -O "$out" "$url" 2>/dev/null && [ -s "$out" ] && return 0

	rm -f "$out"
	return 1
}

fetch() {
	name="$1"
	out="$2"

	say "downloading $name"

	for base in $MIRRORS; do
		if try_url "$base/$name" "$out"; then
			return 0
		fi

		say "  $(echo "$base" | sed 's|https://||;s|/.*||') did not answer, trying the next source"
	done

	die "could not download $name from any source - check the router's internet connection"
}

fetch "$THEME" "$THEME"
fetch "$APP" "$APP"

# -------------------------------------------------------------- install ---

say "installing dependencies that may be missing"
opkg update >/dev/null 2>&1 || say "opkg update failed - continuing with what is already installed"

for dep in rpcd-mod-luci rpcd-mod-file rpcd-mod-iwinfo; do
	opkg list-installed 2>/dev/null | grep -q "^$dep " || opkg install "$dep" >/dev/null 2>&1 || \
		say "note: $dep is not available; some pages may show gaps"
done

say "installing SMARTLink"
opkg install "$THEME" "$APP"

# ---------------------------------------------------------------- finish ---

rm -rf "$TMP"

ADDR="$(uci -q get network.lan.ipaddr || echo 192.168.1.1)"

cat <<EOF

==> done.

    Open  http://$ADDR/cgi-bin/luci/

    SMARTLink is now the active theme and the default landing page.
    LuCI's own pages are one click away under "Administration".

    To go back to another theme:
      uci set luci.main.mediaurlbase=/luci-static/bootstrap && uci commit luci

    To remove SMARTLink entirely:
      opkg remove luci-app-smartlink luci-theme-smartlink

EOF
