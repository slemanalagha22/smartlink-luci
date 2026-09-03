'use strict';
'require view';
'require poll';
'require ui';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - الرئيسية
 *
 * Built from the data rather than from imported markup: render() lays out the
 * page once and keeps references to the few nodes that change, so the poll
 * only has to write values, never rebuild the DOM.
 */

var CHART_BARS = 10;

function confirmReboot() {
	ui.showModal('إعادة التشغيل', [
		E('p', 'سيُعاد تشغيل الراوتر ولن تكون الواجهة متاحة لدقيقة أو دقيقتين.'),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.hideModal }, 'إلغاء'),
			' ',
			E('button', {
				'class': 'btn cbi-button-negative important',
				'click': function() {
					ui.showModal('جارٍ إعادة التشغيل…', [
						E('p', { 'class': 'spinning' }, 'بانتظار الجهاز')
					]);
					data.call('system', 'reboot');
				}
			}, 'أعد التشغيل الآن')
		])
	]);
}

return view.extend({
	load: function() {
		return Promise.all([ data.overview(), data.temperature() ]);
	},

	render: function(res) {
		var d = res[0],
		    temp = res[1],
		    self = this;

		this.history = [];
		this.lastSample = null;

		/* ---- status flow ---- */

		var flowInternet = w.flowNode({
			icon: 'internet', accent: 'internet', label: 'الإنترنت', down: !(d.wan && d.wan.up)
		});

		var flowRouter = w.flowNode({
			icon: 'router', accent: 'primary', label: 'جهاز التوجيه', badge: '—'
		});

		var flowClients = w.flowNode({
			icon: 'devices', accent: 'devices', label: 'العملاء', badge: '—'
		});

		var statusCard = w.card({
			class: 'sl-status-card',
			children: [
				E('div', { 'style': 'display:flex;align-items:center;gap:24px;flex-wrap:wrap' }, [
					w.flow([ flowInternet, flowRouter, flowClients ]),
					w.button({
						label: 'إعادة التشغيل',
						icon: 'restart',
						variant: 'action',
						click: confirmReboot
					})
				])
			]
		});

		/* ---- tiles ---- */

		var tiles = {
			internet: w.tile({
				accent: 'internet', icon: 'internet', title: 'الإنترنت',
				href: L.url('smartlink/network/internet')
			}),
			lan: w.tile({
				accent: 'lan', icon: 'lan', title: 'الشبكة المحلية',
				href: L.url('smartlink/network/lan')
			}),
			wireless: w.tile({
				accent: 'wireless', icon: 'wifi', title: 'الشبكة اللاسلكية',
				href: L.url('smartlink/network/wireless')
			}),
			devices: w.tile({
				accent: 'devices', icon: 'users', title: 'الأجهزة المتصلة',
				href: L.url('smartlink/network/devices')
			})
		};

		/* ---- traffic chart ---- */

		var chart = w.chart(CHART_BARS),
		    chartNow = E('span', {}, 'الآن');

		var chartCard = w.card({
			title: 'استهلاك البيانات',
			desc: 'حركة المرور عبر منفذ الإنترنت، تُقاس كل خمس ثوانٍ.',
			class: 'sl-span-2',
			children: [
				chart,
				E('div', { 'class': 'sl-chart-axis' }, [ E('span', {}, 'الأقدم'), chartNow ])
			]
		});

		/* ---- system information ---- */

		var sysFirmware = E('span', { 'class': 'sl-kv-val' }, '—'),
		    sysUptime   = E('span', { 'class': 'sl-kv-val' }, '—'),
		    sysMemory   = E('span', { 'class': 'sl-kv-val' }, '—'),
		    sysTempRow  = null;

		var kvItems = [
			E('li', {}, [ E('span', { 'class': 'sl-kv-key' }, 'إصدار البرنامج:'), sysFirmware ]),
			E('li', {}, [ E('span', { 'class': 'sl-kv-key' }, 'وقت التشغيل:'), sysUptime ]),
			E('li', {}, [ E('span', { 'class': 'sl-kv-key' }, 'الذاكرة الحرة:'), sysMemory ])
		];

		if (temp !== null && temp !== undefined) {
			var tempVal = E('span', { 'class': 'sl-kv-val' }, '%d° م'.format(temp));
			sysTempRow = E('li', {}, [ E('span', { 'class': 'sl-kv-key' }, 'درجة الحرارة:'), tempVal ]);
			kvItems.push(sysTempRow);
		}

		var sysCard = w.card({
			title: 'معلومات النظام',
			children: [
				E('ul', { 'class': 'sl-kv' }, kvItems),
				w.actions([
					w.button({
						label: 'فتح إدارة LuCI',
						icon: 'settings',
						href: L.url('admin/system/system')
					})
				])
			]
		});

		/* ---- paint ---- */

		function setTile(tile, value, hint) {
			tile.querySelector('.sl-tile-value').textContent = value;
			tile.querySelector('.sl-tile-hint').textContent = hint;
		}

		function setBadge(node, text) {
			var badge = node.querySelector('.sl-flow-badge');

			if (badge)
				badge.textContent = text;
		}

		function paintChart(rate) {
			if (rate === null)
				return;

			self.history.push(rate);

			while (self.history.length > CHART_BARS)
				self.history.shift();

			var peak = Math.max.apply(null, self.history.concat([ 1 ])),
			    bars = chart.querySelectorAll('span');

			for (var i = 0; i < bars.length; i++) {
				var offset = self.history.length - CHART_BARS + i,
				    value = (offset >= 0) ? self.history[offset] : null;

				if (value === null) {
					bars[i].classList.add('is-idle');
					bars[i].style.height = '4%';
					bars[i].title = '';
				}
				else {
					bars[i].classList.remove('is-idle');
					bars[i].style.height = Math.max(4, Math.round(value / peak * 100)) + '%';
					bars[i].title = data.formatRate(value) || '';
				}
			}

			chartNow.textContent = data.formatRate(rate) || 'الآن';
		}

		function paint(snap) {
			var clients = snap.clients || [],
			    active = (snap.radios || []).filter(function(r) { return r.up; }),
			    wan = snap.wan || {},
			    lan = snap.lan || {};

			flowInternet.classList.toggle('is-down', !wan.up);
			setBadge(flowRouter, data.formatUptime(snap.info && snap.info.uptime) || '—');
			setBadge(flowClients, '%d متصل'.format(clients.length));

			setTile(tiles.internet,
				wan.up ? 'متصل' : 'غير متصل',
				wan.up ? (wan.ipaddr || String(wan.proto || '').toUpperCase())
				       : 'تحقق من الكابل أو من المزوّد');

			setTile(tiles.lan,
				lan.up ? 'متصل' : 'غير متصل',
				lan.ipaddr || 'إعدادات الشبكة المحلية وعناوين IP');

			setTile(tiles.wireless,
				active.length ? 'نشط' : 'متوقف',
				active.map(function(r) { return r.ssid; }).filter(Boolean).join(' · ') || 'لا توجد شبكة نشطة');

			setTile(tiles.devices,
				String(clients.length),
				clients.length ? 'عرض الأجهزة النشطة والتحكم في الوصول' : 'لا توجد أجهزة متصلة حالياً');

			var rel = (snap.board && snap.board.release) || {};
			sysFirmware.textContent = rel.description || rel.version || '—';
			sysUptime.textContent = data.formatUptime(snap.info && snap.info.uptime) || '—';

			var mem = snap.info && snap.info.memory;
			sysMemory.textContent = (mem && mem.free !== undefined) ? (data.formatBytes(mem.free) || '—') : '—';

			/* throughput between two samples */
			var sample = snap.stats;

			if (sample) {
				if (self.lastSample) {
					var dt = (sample.at - self.lastSample.at) / 1000,
					    delta = (sample.rx_bytes - self.lastSample.rx_bytes) +
					            (sample.tx_bytes - self.lastSample.tx_bytes);

					if (dt > 0 && delta >= 0)
						paintChart(delta * 8 / dt);
				}

				self.lastSample = sample;
			}
		}

		paint(d);

		poll.add(function() {
			return data.overview().then(paint);
		}, 5);

		return w.page([
			statusCard,
			w.grid(4, [ tiles.devices, tiles.wireless, tiles.lan, tiles.internet ]),
			w.grid(3, [ chartCard, sysCard ])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
