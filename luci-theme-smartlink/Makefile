#
# SMARTLink theme for LuCI
# Copyright (C) 2026 Alagha Technology
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=SMARTLink Theme
LUCI_DEPENDS:=+luci-base

PKG_VERSION:=1.2.1
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Alagha Technology

define Package/luci-theme-smartlink/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.SMARTLink
	uci commit luci
}
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
