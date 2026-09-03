'use strict';
'require baseclass';

/*
 * Shared data layer for the SMARTLink views.
 *
 * Speed matters here. LuCI coalesces outgoing rpc calls into batches, so the
 * cost of a page is roughly "number of dependency waves", not "number of
 * calls". Everything below is therefore issued as two waves:
 *
 *   wave 1  board, system info, interface dump, wireless devices, DHCP
 *           leases, host hints, network devices, temperature
 *   wave 2  one iwinfo assoclist per access-point interface
 *
 * The high-level `network` module was deliberately not used: it loads and
 * parses several uci configs first, which adds waves and pushed the dashboard
 * past fifteen seconds on an MT7621.
 *
 * Every call is wrapped in L.resolveDefault - a router missing one ubus object
 * should show a gap on one card, not an empty page.
 */

/* Sensor probing is a one-off: remembered for the life of the page. */
var tempCache;

/*
 * Direct ubus transport.
 *
 * LuCI's own rpc wrapper is not used here. On some vendor firmware builds its
 * reply path never settles - the HTTP request completes in ~200 ms and the
 * server answers correctly, but the promise handed back by rpc.declare() stays
 * pending forever, which left every page showing its placeholder values.
 *
 * Talking to /admin/ubus directly avoids that, and lets a whole page's worth of
 * calls travel as ONE JSON-RPC array: the dashboard needs two round trips in
 * total rather than one per value.
 */
function ubusBatch(calls) {
	if (!calls.length)
		return Promise.resolve([]);

	var body = calls.map(function(c, i) {
		return {
			jsonrpc: '2.0',
			id: i + 1,
			method: 'call',
			params: [ L.env.sessionid, c[0], c[1], c[2] || {} ]
		};
	});

	return fetch(L.url('admin/ubus'), {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body.length === 1 ? body[0] : body)
	}).then(function(res) {
		if (!res.ok)
			throw new Error('ubus HTTP ' + res.status);

		return res.json();
	}).then(function(replies) {
		var out = new Array(calls.length).fill(null);

		[].concat(replies).forEach(function(rep) {
			if (!rep || typeof rep.id !== 'number')
				return;

			var idx = rep.id - 1,
			    result = rep.result;

			/* ubus answers [status, payload]; status 0 means success. */
			if (Array.isArray(result) && result[0] === 0)
				out[idx] = (result.length > 1) ? result[1] : {};
			else if (result && !Array.isArray(result))
				out[idx] = result;
		});

		return out;
	}).catch(function(err) {
		console.error('[smartlink] ubus batch failed: %s'.format(err));
		return new Array(calls.length).fill(null);
	});
}

/* Boards vary: a generic thermal zone, else a hwmon sensor, else nothing. */
var TEMP_PATHS = [
	'/sys/class/thermal/thermal_zone0/temp',
	'/sys/class/hwmon/hwmon0/temp1_input',
	'/sys/class/hwmon/hwmon1/temp1_input'
];

/* Reading a file goes through rpcd's file object. */
function readFile(path) {
	return ubusBatch([ [ 'file', 'read', { path: path } ] ]).then(function(r) {
		return (r[0] && typeof r[0].data === 'string') ? r[0].data : null;
	});
}

return baseclass.extend({

	/* Escape hatch for one-off calls that are not part of a page snapshot. */
	call: function(object, method, params) {
		return ubusBatch([ [ object, method, params || {} ] ]).then(function(r) {
			return r[0];
		});
	},

	/* ------------------------------------------------------------- writes */

	/*
	 * Applies a list of uci edits, commits the configs they touched and asks
	 * netifd to pick the change up. Everything travels in as few round trips
	 * as the ordering allows: all the sets together, then all the commits,
	 * then the reloads.
	 *
	 * edits: [{ config, section, values }] - values are plain strings.
	 * opts:  { reloadNetwork: bool, reloadWifi: bool }
	 */
	save: function(edits, opts) {
		opts = opts || {};

		var sets = edits.filter(function(e) { return e && e.section && e.values; });

		if (!sets.length)
			return Promise.resolve({ changed: false });

		var configs = [];

		sets.forEach(function(e) {
			if (configs.indexOf(e.config) < 0)
				configs.push(e.config);
		});

		return ubusBatch(sets.map(function(e) {
			return [ 'uci', 'set', { config: e.config, section: e.section, values: e.values } ];
		})).then(function() {
			return ubusBatch(configs.map(function(c) {
				return [ 'uci', 'commit', { config: c } ];
			}));
		}).then(function() {
			var reloads = [];

			if (opts.reloadNetwork !== false)
				reloads.push([ 'network', 'reload', {} ]);

			if (opts.reloadWifi)
				reloads.push([ 'network.wireless', 'reconf', {} ]);

			return reloads.length ? ubusBatch(reloads) : null;
		}).then(function() {
			return { changed: true, configs: configs };
		});
	},

	/* Removes one option (or a whole section when `option` is omitted). */
	uciDelete: function(config, section, option) {
		var params = { config: config, section: section };

		if (option)
			params.option = option;

		return ubusBatch([ [ 'uci', 'delete', params ] ]).then(function() {
			return ubusBatch([ [ 'uci', 'commit', { config: config } ] ]);
		});
	},

	/* ---------------------------------------------------------- formatting */

	formatUptime: function(seconds) {
		seconds = parseInt(seconds, 10);

		if (!(seconds >= 0))
			return null;

		var d = Math.floor(seconds / 86400),
		    h = Math.floor((seconds % 86400) / 3600),
		    m = Math.floor((seconds % 3600) / 60);

		if (d > 0)
			return '%d ي %d س'.format(d, h);
		if (h > 0)
			return '%d س %d د'.format(h, m);

		return '%d دقيقة'.format(m);
	},

	formatRate: function(bitsPerSecond) {
		var v = Number(bitsPerSecond);

		if (!isFinite(v) || v < 0)
			return null;

		var units = [ 'bit/s', 'Kb/s', 'Mb/s', 'Gb/s' ],
		    i = 0;

		while (v >= 1000 && i < units.length - 1) {
			v /= 1000;
			i++;
		}

		return '%s %s'.format(v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1), units[i]);
	},

	formatBytes: function(bytes) {
		var v = Number(bytes);

		if (!isFinite(v) || v < 0)
			return null;

		var units = [ 'B', 'KB', 'MB', 'GB', 'TB' ],
		    i = 0;

		while (v >= 1024 && i < units.length - 1) {
			v /= 1024;
			i++;
		}

		return '%s %s'.format(v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1), units[i]);
	},

	/* ------------------------------------------------------------ raw wave */

	/*
	 * Probed once per page load, off the critical path, and every candidate
	 * path is tried in the SAME batch. Walking them one after another cost
	 * three failed round trips before anything else could start, which is
	 * what made the first paint take fifteen seconds on a board that has no
	 * thermal zone at all.
	 */
	temperature: function() {
		if (tempCache !== undefined)
			return Promise.resolve(tempCache);

		return ubusBatch(TEMP_PATHS.map(function(path) {
			return [ 'file', 'read', { path: path } ];
		})).then(function(results) {
			var found = null;

			for (var i = 0; i < results.length; i++) {
				var milli = parseInt(results[i] && results[i].data, 10);

				if (isFinite(milli) && milli > 0) {
					found = Math.round(milli / 1000);
					break;
				}
			}

			tempCache = found;
			return found;
		});
	},

	/* One round trip for everything that does not depend on another answer. */
	snapshot: function() {
		return ubusBatch([
			[ 'system',            'board' ],
			[ 'system',            'info' ],
			[ 'network.interface', 'dump' ],
			[ 'luci-rpc',          'getWirelessDevices' ],
			[ 'luci-rpc',          'getDHCPLeases' ],
			[ 'luci-rpc',          'getHostHints' ],
			[ 'luci-rpc',          'getNetworkDevices' ]
		]).then(function(r) {
			return {
				board:      r[0] || {},
				info:       r[1] || {},
				interfaces: (r[2] && r[2].interface) || [],
				wireless:   r[3] || {},
				leases:     r[4] || {},
				hints:      r[5] || {},
				devices:    r[6] || {}
			};
		});
	},

	/* ------------------------------------------------------------ derived */

	pickInterface: function(interfaces, name) {
		for (var i = 0; i < interfaces.length; i++)
			if (interfaces[i].interface == name)
				return interfaces[i];

		return null;
	},

	wanFrom: function(snap) {
		var net = this.pickInterface(snap.interfaces, 'wan') ||
		          this.pickInterface(snap.interfaces, 'wwan');

		if (!net)
			return { present: false, up: false };

		var addr = (net['ipv4-address'] || [])[0] || {},
		    route = (net.route || []).filter(function(r) { return r.target == '0.0.0.0'; })[0];

		return {
			present: true,
			up:      !!net.up,
			proto:   net.proto,
			ipaddr:  addr.address || null,
			netmask: addr.mask ? String(addr.mask) : null,
			gateway: route ? route.nexthop : null,
			dns:     net['dns-server'] || [],
			uptime:  net.uptime,
			device:  net.l3_device || net.device || null
		};
	},

	lanFrom: function(snap) {
		var net = this.pickInterface(snap.interfaces, 'lan');

		if (!net)
			return { present: false };

		var addr = (net['ipv4-address'] || [])[0] || {};

		return {
			present: true,
			up:      !!net.up,
			ipaddr:  addr.address || null,
			mask:    addr.mask,
			device:  net.l3_device || net.device || null
		};
	},

	/* Radios, flattened to one entry per access-point interface. */
	radiosFrom: function(snap) {
		var out = [];

		Object.keys(snap.wireless || {}).forEach(function(radioName) {
			var radio = snap.wireless[radioName] || {},
			    cfg = radio.config || {},
			    band = (cfg.band == '5g' || cfg.band == '6g' ||
			            String(cfg.hwmode || '').indexOf('a') >= 0) ? '5' : '2.4';

			(radio.interfaces || []).forEach(function(iface) {
				var icfg = iface.config || {},
				    iw = iface.iwinfo || {};

				if (icfg.mode && icfg.mode != 'ap')
					return;

				out.push({
					radio:      radioName,
					section:    iface.section,
					ifname:     iface.ifname,
					ssid:       icfg.ssid || iw.ssid || null,
					hidden:     !!icfg.hidden,
					encryption: icfg.encryption || 'none',
					band:       band,
					channel:    cfg.channel || iw.channel,
					up:         !!radio.up && !radio.disabled,
					disabled:   !!radio.disabled,
					signal:     iw.signal,
					stations:   []
				});
			});
		});

		return out;
	},

	/* Second round trip: every association list in one array. */
	fillStations: function(radios) {
		var named = radios.filter(function(r) { return !!r.ifname; });

		if (!named.length)
			return Promise.resolve(radios);

		return ubusBatch(named.map(function(r) {
			return [ 'iwinfo', 'assoclist', { device: r.ifname } ];
		})).then(function(results) {
			named.forEach(function(r, i) {
				r.stations = (results[i] && results[i].results) || [];
			});

			return radios;
		});
	},

	clientsFrom: function(snap, radios) {
		var byMac = {},
		    hints = snap.hints || {};

		function hint(mac) {
			return hints[mac] || hints[String(mac).toUpperCase()] || {};
		}

		radios.forEach(function(radio) {
			(radio.stations || []).forEach(function(st) {
				var mac = String(st.mac || '').toUpperCase();

				if (!mac)
					return;

				byMac[mac] = {
					mac:    mac,
					kind:   'wifi',
					band:   radio.band,
					ssid:   radio.ssid,
					signal: st.signal,
					rx_bps: st.rx && st.rx.rate ? st.rx.rate * 1000 : null,
					tx_bps: st.tx && st.tx.rate ? st.tx.rate * 1000 : null,
					name:   hint(mac).name || null,
					ip:     null
				};
			});
		});

		((snap.leases || {}).dhcp_leases || []).forEach(function(lease) {
			var mac = String(lease.macaddr || '').toUpperCase();

			if (!mac)
				return;

			if (!byMac[mac])
				byMac[mac] = { mac: mac, kind: 'wired', band: null, name: null };

			byMac[mac].ip = lease.ipaddr || byMac[mac].ip;
			byMac[mac].name = byMac[mac].name || lease.hostname || null;
			byMac[mac].expires = lease.expires;
		});

		Object.keys(byMac).forEach(function(mac) {
			var c = byMac[mac],
			    h = hint(mac);

			c.name = c.name || h.name || null;

			if (!c.ip && h.ipaddrs && h.ipaddrs.length)
				c.ip = h.ipaddrs[0];
		});

		var list = Object.keys(byMac).map(function(m) { return byMac[m]; });

		list.sort(function(a, b) {
			if (a.kind !== b.kind)
				return a.kind === 'wifi' ? -1 : 1;

			return String(a.ip || '').localeCompare(String(b.ip || ''), undefined, { numeric: true });
		});

		return list;
	},

	/* Byte counters for one device, used to derive a live throughput figure. */
	deviceStats: function(ifname) {
		if (!ifname)
			return Promise.resolve(null);

		return ubusBatch([ [ 'luci-rpc', 'getNetworkDevices' ] ]).then(function(r) {
			var dev = (r[0] || {})[ifname];

			if (!dev || !dev.stats)
				return null;

			return { rx_bytes: dev.stats.rx_bytes, tx_bytes: dev.stats.tx_bytes, at: Date.now() };
		});
	},

	statsFrom: function(snap, ifname) {
		var dev = ifname ? (snap.devices || {})[ifname] : null;

		if (!dev || !dev.stats)
			return null;

		return { rx_bytes: dev.stats.rx_bytes, tx_bytes: dev.stats.tx_bytes, at: Date.now() };
	},

	/* ------------------------------------------------------------ compound */

	/*
	 * Resolves twice: `onFast` fires as soon as the first batch lands so the
	 * page can paint, and the returned promise resolves once the association
	 * lists have filled the client list in.
	 */
	overview: function(onFast) {
		var self = this;

		return this.snapshot().then(function(snap) {
			var radios = self.radiosFrom(snap),
			    wan = self.wanFrom(snap),
			    lan = self.lanFrom(snap);

			var fast = {
				board: snap.board,
				info: snap.info,
				temp: tempCache,
				wan: wan,
				lan: lan,
				radios: radios,
				clients: self.clientsFrom(snap, radios),
				stats: self.statsFrom(snap, wan.device),
				complete: false
			};

			if (typeof onFast === 'function') {
				try { onFast(fast); }
				catch (e) { console.error('[smartlink] fast paint failed: %s'.format(e)); }
			}

			return self.fillStations(radios).then(function(filled) {
				return Object.assign({}, fast, {
					radios: filled,
					clients: self.clientsFrom(snap, filled),
					complete: true
				});
			});
		});
	},

	/* Convenience wrappers kept for pages that only need one thing. */
	board: function() { return L.resolveDefault(callSystemBoard(), {}); },
	info:  function() { return L.resolveDefault(callSystemInfo(), {}); },

	wan: function() {
		var self = this;
		return this.snapshot().then(function(s) { return self.wanFrom(s); });
	},

	lan: function() {
		var self = this;
		return this.snapshot().then(function(s) { return self.lanFrom(s); });
	},

	radios: function() {
		var self = this;
		return this.snapshot().then(function(s) {
			return self.fillStations(self.radiosFrom(s));
		});
	},

	clients: function() {
		var self = this;
		return this.snapshot().then(function(s) {
			return self.fillStations(self.radiosFrom(s)).then(function(radios) {
				return self.clientsFrom(s, radios);
			});
		});
	}
});
