#!/bin/sh
#
# SMARTLink for OpenWrt - one-command installer.
#
#   wget -O - https://raw.githubusercontent.com/slemanalagha22/smartlink-luci/main/install.sh | sh
#
# Downloads both packages and installs them. Safe to re-run: opkg upgrades in
# place, and the theme keeps whatever colour scheme the browser had chosen.

set -e

# Overridable so the packages can be served from a local mirror or a build
# machine on the LAN - useful when the router has no internet yet.
REPO_RAW="${SMARTLINK_BASE:-https://raw.githubusercontent.com/slemanalagha22/smartlink-luci/main/packages}"
VERSION="1.2.0-1"
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

fetch() {
	url="$1"
	out="$2"

	say "downloading $out"

	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$url" -o "$out" && return 0
	fi

	# uclient-fetch on a stock image cannot verify certificates unless
	# ca-bundle is installed; fall back rather than failing outright.
	wget -q -O "$out" "$url" 2>/dev/null && return 0
	wget -q --no-check-certificate -O "$out" "$url" 2>/dev/null && return 0

	die "could not download $url - check the router's internet connection"
}

fetch "$REPO_RAW/$THEME" "$THEME"
fetch "$REPO_RAW/$APP" "$APP"

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
