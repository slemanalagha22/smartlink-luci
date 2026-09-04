'use strict';
'require baseclass';
'require smartlink.data as data';

/*
 * Operation modes, shared by the setup wizard's steps.
 *
 * A mode is expressed as an explicit set of uci edits rather than a stored
 * flag, and the current mode is derived by reading the config back, so a
 * router configured by hand still reports the truth.
 *
 * Nothing here applies anything on its own: a step builds a plan, shows the
 * consequences, and applies it only when the person says so. That matters
 * because three of the four modes change how this interface is reached.
 */

var STA_SECTION = 'smartlink_sta';
var DRAFT_KEY = 'smartlink.setup.mode';

var LIST = [
	{
		key: 'router', icon: 'router', accent: 'primary',
		title: 'راوتر',
		desc: 'الوضع الافتراضي: الجهاز يوزّع الإنترنت من منفذ WAN وينشئ شبكته الخاصة.',
		connection: 'wan'
	},
	{
		key: 'ap', icon: 'bridge', accent: 'lan',
		title: 'نقطة وصول / جسر',
		desc: 'يمرّر الشبكة من راوتر آخر. الواي فاي يبقى شغّالاً، ويُطفأ خادم DHCP ويُضم منفذ WAN إلى الشبكة المحلية.',
		connection: 'address'
	},
	{
		key: 'wisp', icon: 'internet', accent: 'internet',
		title: 'WISP',
		desc: 'يتصل بشبكة لاسلكية أخرى كمصدر للإنترنت، ويبقى راوتراً كامل الوظائف خلفها.',
		connection: 'uplink'
	},
	{
		key: 'repeater', icon: 'repeater', accent: 'wireless',
		title: 'مقوي إشارة',
		desc: 'يمدّد شبكة لاسلكية قائمة بنفس اسمها ونطاق عناوينها.',
		connection: 'uplink',
		requires: 'relayd'
	}
];

/*
 * Edits that keep the access points broadcasting.
 *
 * Every mode except a pure wireless client still serves Wi-Fi, so the radios
 * are switched on and each access-point interface is attached to the LAN
 * bridge. Without this an access point could come up bridged, addressed and
 * completely silent - a radio someone had disabled stays disabled, and an
 * interface left on the `wan` network has nothing to bridge to once wan is
 * gone. The station interface a repeater or WISP adds is left alone.
 */
function keepWifiServing(cfg, staSection) {
	var wireless = cfg.wireless || {},
	    edits = [];

	Object.keys(wireless).forEach(function(name) {
		var section = wireless[name] || {};

		if (section['.type'] === 'wifi-device') {
			edits.push({ config: 'wireless', section: name, values: { disabled: '0' } });
			return;
		}

		if (section['.type'] !== 'wifi-iface')
			return;

		/* the uplink client belongs to whoever created it */
		if (name === staSection || section.mode === 'sta')
			return;

		var values = { disabled: '0' };

		/*
		 * Only re-home an interface that would otherwise be stranded: one with
		 * no network, or one bridged to a network this mode takes away. A
		 * guest SSID on its own network is left where its owner put it.
		 */
		var attached = section.network;

		if (!attached || attached === 'wan' || attached === 'wwan')
			values.network = 'lan';

		edits.push({ config: 'wireless', section: name, values: values });
	});

	return edits;
}

function lanPortsOf(net) {
	var lan = net.lan || {};

	return [].concat(lan.ports || lan.ifname || [])
		.join(' ').split(/\s+/).filter(Boolean);
}

return baseclass.extend({
	STA_SECTION: STA_SECTION,
	list: LIST,

	byKey: function(key) {
		return LIST.filter(function(m) { return m.key === key; })[0] || LIST[0];
	},

	/* ---------------------------------------------------------- detection */

	detect: function(cfg) {
		var net = cfg.network || {},
		    dhcp = cfg.dhcp || {},
		    wireless = cfg.wireless || {};

		var hasStation = Object.keys(wireless).some(function(k) {
			var s = wireless[k];
			return s && s['.type'] === 'wifi-iface' && s.mode === 'sta';
		});

		/* Names are compared exactly so that `wwan`, which WISP adds, is never
		   mistaken for the physical `wan` port. */
		var ports = lanPortsOf(net),
		    wanBridged = ports.some(function(p) { return p === 'wan' || /^wan\d+$/.test(p); }),
		    dhcpOff = (dhcp.lan || {}).ignore === '1';

		if (hasStation) {
			var wwan = net.wwan || {};
			return (wwan.proto === 'dhcp' || wwan.proto === 'static') ? 'wisp' : 'repeater';
		}

		if (wanBridged || dhcpOff)
			return 'ap';

		return 'router';
	},

	/* ------------------------------------------------- wizard draft state */

	/*
	 * The wizard spans several page loads, so the chosen mode is parked in
	 * sessionStorage: it belongs to this tab's run of the wizard and should
	 * not outlive it.
	 */
	rememberChoice: function(key) {
		try { sessionStorage.setItem(DRAFT_KEY, key); }
		catch (e) { /* private mode: the step will fall back to detection */ }
	},

	recallChoice: function(fallback) {
		try { return sessionStorage.getItem(DRAFT_KEY) || fallback; }
		catch (e) { return fallback; }
	},

	forgetChoice: function() {
		try { sessionStorage.removeItem(DRAFT_KEY); }
		catch (e) {}
	},

	/* ---------------------------------------------------------- planning */

	/*
	 * Returns { edits, drops, creates, address } for a mode.
	 *
	 * opts carries whatever the connection step collected:
	 *   ap    - { addressing: 'dhcp'|'static', ipaddr, netmask, gateway }
	 *   wisp  - { radio, ssid, encryption, key }
	 */
	plan: function(key, cfg, opts) {
		opts = opts || {};

		var net = cfg.network || {},
		    lan = net.lan || {},
		    ports = lanPortsOf(net).filter(function(p) {
		        return p !== 'wan' && !/^wan\d+$/.test(p);
		    });

		if (key === 'router') {
			return {
				edits: [
					{ config: 'network', section: 'lan', values: {
						proto: 'static',
						ipaddr: lan.ipaddr || '192.168.1.1',
						netmask: lan.netmask || '255.255.255.0',
						ports: ports,
						gateway: '',
						dns: ''
					} },
					{ config: 'network', section: 'wan', values: { disabled: '0' } },
					{ config: 'dhcp', section: 'lan', values: { ignore: '0' } }
				].concat(keepWifiServing(cfg, STA_SECTION)),
				drops: [ [ 'wireless', STA_SECTION ], [ 'network', 'wwan' ] ],
				creates: [],
				address: lan.ipaddr || '192.168.1.1',
				wifi: true
			};
		}

		if (key === 'ap') {
			var values = { ports: ports.concat([ 'wan' ]) },
			    fixed = (opts.addressing === 'static');

			if (fixed) {
				values.proto = 'static';
				values.ipaddr = opts.ipaddr;
				values.netmask = opts.netmask;
				values.gateway = opts.gateway;
				values.dns = opts.gateway;
			}
			else {
				values.proto = 'dhcp';
				values.ipaddr = '';
				values.netmask = '';
				values.gateway = '';
				values.dns = '';
			}

			return {
				edits: [
					{ config: 'network', section: 'lan', values: values },
					{ config: 'network', section: 'wan', values: { disabled: '1' } },
					{ config: 'dhcp', section: 'lan', values: { ignore: '1' } }
				].concat(keepWifiServing(cfg, STA_SECTION)),
				drops: [ [ 'wireless', STA_SECTION ], [ 'network', 'wwan' ] ],
				creates: [],
				address: fixed ? opts.ipaddr : null,
				wifi: true
			};
		}

		/* wisp and repeater both add a station interface */
		var wisp = (key === 'wisp');

		return {
			edits: [
				{ config: 'wireless', section: STA_SECTION, values: {
					device: opts.radio || '',
					mode: 'sta',
					network: wisp ? 'wwan' : 'lan',
					ssid: opts.ssid || '',
					encryption: opts.encryption || 'none',
					key: opts.key || ''
				} },
				{ config: 'network', section: 'wwan', values: { proto: wisp ? 'dhcp' : 'none' } },
				{ config: 'network', section: 'lan', values: { ports: ports } },
				{ config: 'dhcp', section: 'lan', values: { ignore: wisp ? '0' : '1' } }
			].concat(keepWifiServing(cfg, STA_SECTION)),
			drops: [],
			creates: [
				{ config: 'wireless', section: STA_SECTION, type: 'wifi-iface' },
				{ config: 'network', section: 'wwan', type: 'interface' }
			],
			address: null,
			wifi: true
		};
	},

	/* Creates missing sections, drops stale ones, then applies the edits. */
	apply: function(plan, cfg) {
		var creates = (plan.creates || []).filter(function(c) {
			return !((cfg[c.config] || {})[c.section]);
		});

		return Promise.all(creates.map(function(c) {
			return data.call('uci', 'add', {
				config: c.config, type: c.type, name: c.section, values: {}
			});
		})).then(function() {
			return Promise.all((plan.drops || []).map(function(d) {
				return ((cfg[d[0]] || {})[d[1]])
					? data.uciDelete(d[0], d[1])
					: Promise.resolve();
			}));
		}).then(function() {
			return data.save(plan.edits, { reloadNetwork: true, reloadWifi: !!plan.wifi });
		});
	},

	/* The uci encryption value a scanned network needs. */
	encryptionFor: function(ap) {
		var e = (ap && ap.encryption) || {};

		if (!e.enabled)
			return 'none';

		var wpa = [].concat(e.wpa || []);

		if (wpa.indexOf(3) >= 0) return 'sae-mixed';
		if (wpa.indexOf(2) >= 0) return 'psk2';

		return 'psk';
	}
});
