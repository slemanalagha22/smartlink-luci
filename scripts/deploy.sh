#!/bin/sh
#
# Push the SMARTLink theme and app onto a running OpenWrt device.
#
#   scripts/deploy.sh [user@host]
#
# Files are streamed through tar over one SSH connection rather than scp,
# because dropbear usually has no sftp-server and OpenSSH 9+ defaults to SFTP.
# This installs the same paths the .ipk packages would; it does not switch the
# active theme - see the note printed at the end.

set -e

HOST="${1:-root@192.168.1.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

THEME="$ROOT/luci-theme-smartlink"
APP="$ROOT/luci-app-smartlink"

echo "==> target: $HOST"

echo "==> creating directories"
ssh -o BatchMode=yes "$HOST" '
	mkdir -p /www/luci-static/smartlink \
	         /www/luci-static/resources/view/smartlink \
	         /www/luci-static/resources/smartlink \
	         /www/luci-static/resources/smartlink-app \
	         /usr/share/ucode/luci/template/themes/smartlink \
	         /usr/share/luci/menu.d \
	         /usr/share/rpcd/acl.d
'

echo "==> theme: static assets"
tar -C "$THEME/htdocs/luci-static" -cf - smartlink \
	| ssh -o BatchMode=yes "$HOST" 'tar -C /www/luci-static -xf -'

echo "==> theme: menu renderer + login view"
tar -C "$THEME/htdocs/luci-static/resources" -cf - menu-smartlink.js view \
	| ssh -o BatchMode=yes "$HOST" 'tar -C /www/luci-static/resources -xf -'

echo "==> theme: ucode templates"
tar -C "$THEME/ucode/template/themes" -cf - smartlink \
	| ssh -o BatchMode=yes "$HOST" 'tar -C /usr/share/ucode/luci/template/themes -xf -'

echo "==> app: page views, data layer, assets"
tar -C "$APP/htdocs/luci-static/resources" -cf - view smartlink smartlink-app \
	| ssh -o BatchMode=yes "$HOST" 'tar -C /www/luci-static/resources -xf -'

echo "==> app: menu + acl"
tar -C "$APP/root/usr/share" -cf - luci/menu.d rpcd/acl.d \
	| ssh -o BatchMode=yes "$HOST" 'tar -C /usr/share -xf -'

echo "==> registering theme and flushing caches"
ssh -o BatchMode=yes "$HOST" '
	uci -q get luci.themes.SMARTLink >/dev/null || uci set luci.themes.SMARTLink=/luci-static/smartlink
	uci commit luci
	rm -f /tmp/luci-indexcache* 2>/dev/null
	rm -rf /tmp/luci-modulecache 2>/dev/null
	/etc/init.d/rpcd restart >/dev/null 2>&1
	echo "   active theme: $(uci -q get luci.main.mediaurlbase)"
'

cat <<'NOTE'

==> done.

To switch the interface to SMARTLink:
    uci set luci.main.mediaurlbase=/luci-static/smartlink && uci commit luci

To go back to the previous theme:
    uci set luci.main.mediaurlbase=/luci-static/argon && uci commit luci
NOTE
