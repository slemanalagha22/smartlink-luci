'use strict';
'require view';
'require poll';
'require ui';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - الأجهزة المتصلة
 *
 * Blocking is a real firewall rule, not a cosmetic flag: one `config rule`
 * per blocked client, matching its MAC on the LAN zone and rejecting traffic
 * towards WAN. That is the same mechanism LuCI's own traffic rules use, so a
 * rule added here stays visible and editable under Administration.
 */

var RULE_PREFIX = 'smartlink_block_';

function ruleNameFor(mac) {
	return RULE_PREFIX + String(mac).toUpperCase().replace(/:/g, '');
}

function deviceIcon(client) {
	if (client.kind !== 'wifi')
		return 'monitor';

	return (client.band === '5') ? 'laptop' : 'phone';
}

return view.extend({
	load: function() {
		return Promise.all([
			data.overview(),
			data.call('uci', 'get', { config: 'firewall', type: 'rule' })
		]);
	},

	/* Blocked MACs, read from the firewall rules this page created. */
	blockedFrom: function(fw) {
		var out = {};

		Object.keys((fw && fw.values) || {}).forEach(function(sid) {
			var rule = fw.values[sid];

			if (rule && String(rule.name || '').indexOf(RULE_PREFIX) === 0 && rule.src_mac)
				out[String(rule.src_mac).toUpperCase()] = sid;
		});

		return out;
	},

	render: function(res) {
		var self = this,
		    snap = res[0],
		    blocked = this.blockedFrom(res[1]),
		    showBlocked = false;

		this.lastSample = null;

		/* ---- stats ---- */

		var statTotal = w.stat({ accent: 'devices',  icon: 'devices', label: 'إجمالي الأجهزة', value: '—' }),
		    statWifi  = w.stat({ accent: 'wireless', icon: 'wifi',    label: 'اتصال لاسلكي',  value: '—' }),
		    statWired = w.stat({ accent: 'lan',      icon: 'lan',     label: 'اتصال سلكي',    value: '—' }),
		    statRate  = w.stat({ accent: 'internet', icon: 'speed',   label: 'عرض النطاق الحالي', value: '—' });

		function setStat(node, value) {
			node.querySelector('.sl-stat-value').textContent = value;
		}

		/* ---- filter ---- */

		var tabConnected = w.button({ label: 'قائمة العملاء المتصلين', variant: 'action' }),
		    tabBlocked = w.button({ label: 'القائمة السوداء' });

		var tbody = E('tbody', {});

		var table = w.table([
			{ title: 'الجهاز' },
			{ title: 'عنوان IP' },
			{ title: 'عنوان MAC' },
			{ title: 'نوع الاتصال' },
			{ title: 'الإجراءات', actions: true }
		], []);

		table.querySelector('table').replaceChild(tbody, table.querySelector('tbody'));

		function setFilter(showBlockedList) {
			showBlocked = showBlockedList;
			tabConnected.className = showBlocked ? 'btn cbi-button-neutral' : 'btn cbi-button-action';
			tabBlocked.className = showBlocked ? 'btn cbi-button-action' : 'btn cbi-button-neutral';
			self.repaint();
		}

		tabConnected.addEventListener('click', function() { setFilter(false); });
		tabBlocked.addEventListener('click', function() { setFilter(true); });

		/* ---- actions ---- */

		function block(client) {
			var name = ruleNameFor(client.mac);

			return data.call('uci', 'add', {
				config: 'firewall',
				type: 'rule',
				values: {
					name: name,
					src: 'lan',
					dest: 'wan',
					src_mac: client.mac,
					target: 'REJECT'
				}
			}).then(function() {
				return data.call('uci', 'commit', { config: 'firewall' });
			}).then(function() {
				return data.call('file', 'exec', { command: '/etc/init.d/firewall', params: [ 'reload' ] });
			}).then(function() {
				ui.addNotification(null, E('p', 'تم حظر %s من الوصول إلى الإنترنت.'.format(client.name || client.mac)), 'info');
				return self.refresh();
			}).catch(function(err) {
				ui.addNotification(null, E('p', 'تعذّر الحظر: ' + err), 'error');
			});
		}

		function unblock(client) {
			var sid = blocked[String(client.mac).toUpperCase()];

			if (!sid)
				return Promise.resolve();

			return data.uciDelete('firewall', sid).then(function() {
				return data.call('file', 'exec', { command: '/etc/init.d/firewall', params: [ 'reload' ] });
			}).then(function() {
				ui.addNotification(null, E('p', 'تم رفع الحظر عن %s.'.format(client.name || client.mac)), 'info');
				return self.refresh();
			}).catch(function(err) {
				ui.addNotification(null, E('p', 'تعذّر رفع الحظر: ' + err), 'error');
			});
		}

		/* ---- rows ---- */

		function row(client) {
			var isBlocked = !!blocked[String(client.mac).toUpperCase()];

			var badge = (client.kind === 'wifi')
				? w.chip('Wi-Fi %s GHz'.format(client.band), 'wireless')
				: w.chip('سلكي', 'lan');

			var action = isBlocked
				? w.button({ label: 'إلغاء الحظر', variant: 'action', click: function() { unblock(client); } })
				: w.button({ label: 'حظر الإنترنت', variant: 'remove', click: function() { block(client); } });

			return E('tr', {}, [
				E('td', {}, [
					E('div', { 'class': 'sl-device' }, [
						E('div', { 'class': 'sl-device-icon' }, [ w.icon(deviceIcon(client)) ]),
						E('div', {}, [
							E('div', { 'class': 'sl-device-name' }, client.name || client.mac),
							E('div', { 'class': 'sl-device-sub' },
								client.kind === 'wifi'
									? ((client.ssid || 'Wi-Fi') + (client.signal != null ? ' · %d dBm'.format(client.signal) : ''))
									: 'اتصال سلكي')
						])
					])
				]),
				E('td', { 'class': 'sl-mono' }, client.ip || '—'),
				E('td', { 'class': 'sl-mono' }, client.mac),
				E('td', {}, [ badge ]),
				E('td', { 'class': 'sl-cell-actions' }, [ action ])
			]);
		}

		this.repaint = function() {
			var clients = (self.snap.clients || []).slice(),
			    wifi = clients.filter(function(c) { return c.kind === 'wifi'; }).length;

			setStat(statTotal, String(clients.length));
			setStat(statWifi, String(wifi));
			setStat(statWired, String(clients.length - wifi));

			var list = showBlocked
				? clients.filter(function(c) { return !!blocked[String(c.mac).toUpperCase()]; })
				: clients;

			/* A blocked device that is currently offline still belongs on the list. */
			if (showBlocked) {
				Object.keys(blocked).forEach(function(mac) {
					if (!list.some(function(c) { return String(c.mac).toUpperCase() === mac; }))
						list.push({ mac: mac, kind: 'wired', name: null, ip: null });
				});
			}

			tbody.textContent = '';

			if (!list.length) {
				tbody.appendChild(w.emptyRow(5, showBlocked
					? 'لا توجد أجهزة محظورة.'
					: 'لا توجد أجهزة متصلة حالياً.'));
				return;
			}

			list.forEach(function(c) { tbody.appendChild(row(c)); });
		};

		this.refresh = function() {
			return Promise.all([
				data.overview(),
				data.call('uci', 'get', { config: 'firewall', type: 'rule' })
			]).then(function(r) {
				self.snap = r[0];
				blocked = self.blockedFrom(r[1]);
				self.applyRate(r[0]);
				self.repaint();
			});
		};

		this.applyRate = function(s) {
			if (!s.stats)
				return;

			if (self.lastSample) {
				var dt = (s.stats.at - self.lastSample.at) / 1000,
				    delta = (s.stats.rx_bytes - self.lastSample.rx_bytes) +
				            (s.stats.tx_bytes - self.lastSample.tx_bytes);

				if (dt > 0 && delta >= 0)
					setStat(statRate, data.formatRate(delta * 8 / dt) || '—');
			}

			self.lastSample = s.stats;
		};

		this.snap = snap;
		this.applyRate(snap);
		this.repaint();

		poll.add(function() {
			return data.overview().then(function(s) {
				self.snap = s;
				self.applyRate(s);
				self.repaint();
			});
		}, 5);

		return w.page([
			w.head({
				icon: 'devices',
				accent: 'devices',
				title: 'إدارة الأجهزة المتصلة',
				subtitle: 'راقب وتحكم في كافة الأجهزة المرتبطة بشبكة SMARTLink الخاصة بك.',
				actions: [ tabConnected, tabBlocked ]
			}),
			w.grid(4, [ statTotal, statWifi, statWired, statRate ]),
			w.card({ children: [ table ] })
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
