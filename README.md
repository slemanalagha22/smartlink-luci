# SMARTLink for OpenWrt / LuCI

An Arabic-first, RTL-aware interface for OpenWrt routers: a LuCI theme plus the
pages that go with it — dashboard, connected devices, wireless, LAN, internet,
tools, and a four-step setup wizard.

No firmware rebuild and no changes to the base system. Two ordinary `.ipk`
packages, the same shape Argon ships in.

## Install on a router (one command)

```sh
wget -O - https://cdn.jsdelivr.net/gh/slemanalagha22/smartlink-luci@main/install.sh | sh
```

Then open `http://<router-ip>/cgi-bin/luci/` - SMARTLink is already the active
theme and the default landing page.

The installer pulls the packages from jsDelivr first and falls back to
raw.githubusercontent.com. Both mirror this repository; raw is unreachable on
some networks, which is why neither is relied on alone.

If the router's `wget` cannot verify certificates yet:

```sh
opkg update && opkg install ca-bundle
```

### Install from a machine on the LAN

When the router has no internet of its own, serve this repository from a
machine that does and point the installer at it:

```sh
# on the machine, from the repository root
python -m http.server 8899

# on the router
wget -O /tmp/i.sh http://<machine-ip>:8899/install.sh
SMARTLINK_BASE=http://<machine-ip>:8899/packages sh /tmp/i.sh
```

### Install without ssh

If the router refuses ssh but its web interface still answers, install over the
LuCI session instead - no key or account is added to the router:

```sh
python scripts/deploy_ubus.py <router-ip> [root-password]
```

### Or install the packages by hand

```sh
cd /tmp
B=https://cdn.jsdelivr.net/gh/slemanalagha22/smartlink-luci@main/packages
wget $B/luci-theme-smartlink_1.2.5-1_all.ipk
wget $B/luci-app-smartlink_1.2.5-1_all.ipk
opkg install luci-theme-smartlink_1.2.5-1_all.ipk luci-app-smartlink_1.2.5-1_all.ipk
```

### Remove

```sh
opkg remove luci-app-smartlink luci-theme-smartlink
```

Removing the theme puts LuCI back on whichever stock theme is still installed.

---

## How it is put together

### Separate mode, not extra menus

SMARTLink registers its own LuCI **mode** (`smartlink`) beside `admin`. Each
mode owns its menu bar, so the interface shows only the five SMARTLink
sections, and LuCI's own Network / System / Services / Status stay one click
away under "Administration" in the header. Nothing is hidden or removed.

```
SMARTLink       الرئيسية · الشبكة · التطبيق · الأدوات · الإعداد
Administration  LuCI's own pages, untouched
```

### Direct ubus transport

`resources/smartlink/data.js` talks to `/cgi-bin/luci/admin/ubus` itself rather
than through LuCI's `rpc` module.

This is not a preference. On the KT-708H firmware this was developed against,
`rpc.declare()` never settles: the HTTP request completes in ~200 ms and the
router answers correctly, but the promise stays pending forever — which also
leaves LuCI's own status pages stuck on "Loading view…". Going straight to
ubus sidesteps that, and lets a page's whole set of calls travel as one
JSON-RPC array. The dashboard needs **two round trips** and paints in about
300 ms.

### Pages built from data

Each view assembles its DOM from `resources/smartlink/widgets.js` — `tile`,
`stat`, `flow`, `table`, `field`, `toggle`, `steps`, `note` — and keeps
references to the nodes that change, so a poll writes values without rebuilding
anything. Class names are semantic (`.sl-tile-value`, `.sl-stat-value`), which
is what lets the visual design change without breaking the data binding.

---

## What each page actually does

| Page | Reads | Writes |
|---|---|---|
| الرئيسية | uptime, clients, WAN/LAN state, SSIDs, firmware, memory, live WAN throughput | reboot (confirmed) |
| الأجهزة المتصلة | wifi stations + DHCP leases + host hints | blocks/unblocks a client with a real firewall rule |
| الشبكة اللاسلكية | radios, SSIDs, encryption, channel, stations | SSID, encryption, password, hidden, radio on/off |
| الشبكة المحلية | LAN address, netmask, DHCP pool | LAN address, netmask, DHCP range and lease |
| الإنترنت | WAN state, address, gateway, uptime | protocol (DHCP / PPPoE / static) and its fields |
| التطبيق | probes which service configs exist | — (links into LuCI) |
| الأدوات | board info, system log | reboot, network reload, wireless reconf |
| الإعداد (4 steps) | current state at each step | WAN in step 1, both radios in step 2 |

Blocking writes a `config rule` in `/etc/config/firewall` named
`smartlink_block_<MAC>` — the same mechanism LuCI's traffic rules use, so a
rule created here stays visible and editable under Administration.

---

## Known gaps

- **Per-client rate limiting is not implemented.** It needs SQM or tc, which is
  a separate piece of work; the page offers blocking instead of pretending.
- **Repeater mode is not implemented.** It needs an upstream-network scanner
  and a client interface.
- **Temperature is hidden when the board has no sensor.** The MT7621 test board
  exposes none, so that row does not render there.
- Interface strings are Arabic literals rather than a `po` catalogue. Adding
  other languages means extracting them into `po/` first.

---

## Repository layout

```
luci-theme-smartlink/
├── htdocs/luci-static/smartlink/     cascade.css (tokens + components), fonts, icons
├── htdocs/luci-static/resources/     menu-smartlink.js, view/smartlink/sysauth.js
├── ucode/template/themes/smartlink/  header.ut  footer.ut  sysauth.ut
└── root/etc/uci-defaults/            theme registration

luci-app-smartlink/
├── htdocs/luci-static/resources/smartlink/   data.js (ubus + uci), widgets.js
├── htdocs/luci-static/resources/view/smartlink/   one file per page
└── root/usr/share/                   luci/menu.d, rpcd/acl.d

scripts/
├── build_ipk.py   builds packages/*.ipk (pure Python, no SDK needed)
└── deploy.sh      pushes files straight onto a router over ssh
```

`scripts/deploy.sh root@192.168.1.1` copies the files in place without
packaging — useful while iterating; `build_ipk.py` is what produces something
installable.

---

## Set a root password

A stock OpenWrt install has no root password: SSH accepts a blank one and LuCI
shows a "No password set!" banner on every page. Anything on the LAN has full
control of the router until this is set:

```sh
passwd
```
