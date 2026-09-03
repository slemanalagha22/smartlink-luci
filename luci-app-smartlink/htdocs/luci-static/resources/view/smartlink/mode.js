'use strict';
'require view';
'require ui';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - وضع التشغيل
 *
 * Router / Access point / WISP / Repeater.
 *
 * Every mode is expressed as an explicit set of uci edits rather than as a
 * stored flag, and the current mode is read back from the config, so a router
 * that was set up by hand still reports the truth here.
 *
 * Switching mode changes how this page is reached. Each switch therefore
 * spells out the new address before it is applied, and the confirmation says
 * what to do if the browser cannot follow - because on a small router the
 * recovery path is a paperclip, and people deserve to know that first.
 */

var STA_SECTION = 'smartlink_sta';

function lanPortsOf(net) {
	var lan = net.lan || {};

	return [].concat(lan.ports || lan.ifname || [])
		.join(' ').split(/\s+/).filter(Boolean);
}

function isIPv4(v) {
	var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(v || '').trim());
	if (!m) return false;
	for (var i = 1; i <= 4; i++) if (parseInt(m[i], 10) > 255) return false;
	return true;
}

/* Which uci encryption value a scanned network needs. */
function encryptionFor(ap) {
	var e = ap.encryption || {};

	if (!e.enabled)
		return 'none';

	var wpa = [].concat(e.wpa || []);

	if (wpa.indexOf(3) >= 0)
		return 'sae-mixed';

	if (wpa.indexOf(2) >= 0)
		return 'psk2';

	return 'psk';
}

return view.extend({
	load: function() {
		return Promise.all([
			data.modeConfig(),
			data.overview(),
			data.hasPackage('relayd')
		]);
	},

	render: function(res) {
		var self = this,
		    cfg = res[0],
		    snap = res[1],
		    hasRelayd = res[2],
		    current = data.detectMode(cfg),
		    radios = snap.radios || [],
		    lan = snap.lan || {};

		this.cfg = cfg;
		this.selected = current;

		/* ------------------------------------------------------ definitions */

		var MODES = [
			{
				key: 'router', icon: 'router', accent: 'primary',
				title: 'راوتر',
				desc: 'الوضع الافتراضي: الجهاز يوزّع الإنترنت من منفذ WAN وينشئ شبكته الخاصة.'
			},
			{
				key: 'ap', icon: 'bridge', accent: 'lan',
				title: 'نقطة وصول / جسر',
				desc: 'يمرّر الشبكة من راوتر آخر ويعمل كموسّع سلكي. يُطفأ خادم DHCP ويُضم منفذ WAN إلى الشبكة المحلية.'
			},
			{
				key: 'wisp', icon: 'internet', accent: 'internet',
				title: 'WISP',
				desc: 'يتصل بشبكة لاسلكية أخرى كمصدر للإنترنت، ويبقى راوتراً كامل الوظائف خلفها.'
			},
			{
				key: 'repeater', icon: 'repeater', accent: 'wireless',
				title: 'مقوي إشارة',
				desc: 'يمدّد شبكة لاسلكية قائمة بنفس اسمها ونطاق عناوينها.',
				requires: 'relayd',
				available: hasRelayd
			}
		];

		/* ------------------------------------------------ per-mode settings */

		var apMode = w.select({
			id: 'sl-ap-addr',
			value: 'dhcp',
			options: [
				[ 'dhcp', 'احصل على عنوان من الراوتر الرئيسي تلقائياً' ],
				[ 'static', 'عيّن عنواناً ثابتاً' ]
			]
		});

		var apIp = w.input({ id: 'sl-ap-ip', value: lan.ipaddr || '192.168.1.2' }),
		    apMask = w.input({ id: 'sl-ap-mask', value: '255.255.255.0' }),
		    apGw = w.input({ id: 'sl-ap-gw', value: '192.168.1.1' });

		var apStatic = w.fields([
			w.field({ label: 'عنوان الجهاز', control: apIp }),
			w.field({ label: 'قناع الشبكة', control: apMask }),
			w.field({ label: 'بوابة الراوتر الرئيسي', control: apGw, wide: true })
		]);

		function syncAp() {
			apStatic.style.display = (apMode.value === 'static') ? '' : 'none';
		}

		apMode.addEventListener('change', syncAp);
		syncAp();

		/* --- uplink picker, shared by WISP and repeater --- */

		var radioSelect = w.select({
			id: 'sl-uplink-radio',
			value: (radios[0] || {}).radio,
			options: radios.map(function(r) {
				return [ r.radio, '%s — %s غيغاهرتز'.format(r.radio, r.band) ];
			})
		});

		var scanList = E('div', { 'class': 'sl-scan' }, [
			E('p', { 'class': 'sl-tile-hint' }, 'اضغط «ابحث عن الشبكات» لعرض ما حولك.')
		]);

		var uplinkKey = w.input({ id: 'sl-uplink-key', type: 'password', placeholder: 'كلمة مرور الشبكة المختارة' });

		this.uplink = null;

		var scanBtn = w.button({ label: 'ابحث عن الشبكات', icon: 'refresh', variant: 'action' });

		scanBtn.addEventListener('click', function() {
			var radio = radios.filter(function(r) { return r.radio === radioSelect.value; })[0];

			if (!radio || !radio.ifname) {
				ui.addNotification(null, E('p', 'لا توجد واجهة لاسلكية يمكن المسح بها.'), 'warning');
				return;
			}

			scanBtn.disabled = true;
			scanList.textContent = '';
			scanList.appendChild(E('p', { 'class': 'spinning' }, 'جارٍ البحث…'));

			data.scan(radio.ifname).then(function(found) {
				scanBtn.disabled = false;
				scanList.textContent = '';

				if (!found.length) {
					scanList.appendChild(E('p', { 'class': 'sl-tile-hint' }, 'لم يُعثر على شبكات.'));
					return;
				}

				found.forEach(function(ap) {
					var pct = Math.round(100 * (ap.quality || 0) / (ap.qualityMax || 70)),
					    enc = encryptionFor(ap);

					var row = E('button', { 'type': 'button', 'class': 'sl-scan-row' }, [
						E('div', {}, [
							E('div', { 'class': 'sl-scan-name' }, ap.ssid),
							E('div', { 'class': 'sl-scan-meta' },
								'قناة %s · %s'.format(ap.channel || '—', enc === 'none' ? 'مفتوحة' : enc.toUpperCase()))
						]),
						E('div', { 'class': 'sl-scan-signal' }, [
							E('div', {}, '%d%%'.format(pct)),
							E('div', { 'class': 'sl-scan-meta' }, '%d dBm'.format(ap.signal || 0))
						])
					]);

					row.addEventListener('click', function() {
						scanList.querySelectorAll('.sl-scan-row').forEach(function(n) {
							n.classList.remove('is-selected');
						});

						row.classList.add('is-selected');
						self.uplink = { ssid: ap.ssid, encryption: enc, radio: radioSelect.value };
						uplinkKey.style.display = (enc === 'none') ? 'none' : '';
					});

					scanList.appendChild(row);
				});
			}).catch(function(err) {
				scanBtn.disabled = false;
				scanList.textContent = '';
				scanList.appendChild(E('p', { 'class': 'sl-field-error' }, 'تعذّر البحث: ' + err));
			});
		});

		var uplinkPanel = E('div', { 'style': 'display:grid;gap:16px' }, [
			w.fields([
				w.field({ label: 'الراديو المستخدم للاتصال', control: radioSelect }),
				w.field({ label: 'كلمة مرور الشبكة', control: uplinkKey })
			]),
			E('div', {}, [ scanBtn ]),
			scanList
		]);

		/* ------------------------------------------------------- mode cards */

		var settingsHolder = E('div', {});

		var cards = MODES.map(function(m) {
			var unavailable = (m.available === false);

			var card = E('button', {
				'type': 'button',
				'class': 'sl-mode sl-accent-' + m.accent +
					(m.key === current ? ' is-current' : '') +
					(unavailable ? ' is-unavailable' : ''),
				'disabled': unavailable ? '' : null
			}, [
				m.key === current ? E('span', { 'class': 'sl-mode-tag' }, 'الوضع الحالي') : '',
				E('div', { 'class': 'sl-mode-icon' }, [ w.icon(m.icon) ]),
				E('div', { 'class': 'sl-mode-title' }, m.title),
				E('div', { 'class': 'sl-mode-desc' }, m.desc),
				unavailable ? E('div', { 'class': 'sl-field-error' },
					'يحتاج حزمة %s غير المثبّتة.'.format(m.requires)) : ''
			]);

			if (!unavailable)
				card.addEventListener('click', function() { select(m.key); });

			return { key: m.key, node: card };
		});

		function select(key) {
			self.selected = key;

			cards.forEach(function(c) {
				c.node.classList.toggle('is-selected', c.key === key);
				c.node.style.borderColor = (c.key === key) ? 'var(--sl-accent)' : '';
			});

			settingsHolder.textContent = '';

			if (key === 'ap') {
				settingsHolder.appendChild(w.card({
					title: 'عنوان الجهاز في وضع نقطة الوصول',
					desc: 'بعد التبديل لن يوزّع هذا الجهاز عناوين؛ سيأخذ عنوانه من الراوتر الرئيسي أو يستخدم العنوان الذي تحدّده.',
					children: [ w.fields([ w.field({ label: 'طريقة العنونة', control: apMode, wide: true }) ], true), apStatic ]
				}));
			}
			else if (key === 'wisp' || key === 'repeater') {
				settingsHolder.appendChild(w.card({
					title: 'الشبكة المصدر',
					desc: 'اختر الشبكة اللاسلكية التي سيتصل بها الجهاز ليأخذ منها الإنترنت.',
					children: [ uplinkPanel ]
				}));
			}

			applyBtn.disabled = (key === current && key !== 'wisp' && key !== 'repeater');
			applyBtn.querySelector('span').textContent =
				(key === current) ? 'إعادة تطبيق الوضع' : 'طبّق الوضع';
		}

		/* ------------------------------------------------------------ apply */

		function editsFor(key) {
			var net = cfg.network || {},
			    ports = lanPortsOf(net).filter(function(p) { return p !== 'wan' && !/^wan\d+$/.test(p); });

			if (key === 'router') {
				return {
					edits: [
						{ config: 'network', section: 'lan', values: {
							proto: 'static',
							ipaddr: (net.lan || {}).ipaddr || '192.168.1.1',
							netmask: (net.lan || {}).netmask || '255.255.255.0',
							ports: ports,
							gateway: '',
							dns: ''
						} },
						{ config: 'network', section: 'wan', values: { disabled: '0' } },
						{ config: 'dhcp', section: 'lan', values: { ignore: '0' } }
					],
					drops: [ [ 'wireless', STA_SECTION ], [ 'network', 'wwan' ] ],
					address: (net.lan || {}).ipaddr || '192.168.1.1',
					wifi: true
				};
			}

			if (key === 'ap') {
				var values = { ports: ports.concat([ 'wan' ]) };

				if (apMode.value === 'static') {
					values.proto = 'static';
					values.ipaddr = apIp.value.trim();
					values.netmask = apMask.value.trim();
					values.gateway = apGw.value.trim();
					values.dns = apGw.value.trim();
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
					],
					drops: [ [ 'wireless', STA_SECTION ], [ 'network', 'wwan' ] ],
					address: (apMode.value === 'static') ? apIp.value.trim() : null,
					wifi: true
				};
			}

			/* wisp and repeater both add a station interface */
			var up = self.uplink;

			return {
				needsUplink: true,
				edits: [
					{ config: 'wireless', section: STA_SECTION, values: {
						device: up ? up.radio : '',
						mode: 'sta',
						network: (key === 'wisp') ? 'wwan' : 'lan',
						ssid: up ? up.ssid : '',
						encryption: up ? up.encryption : 'none',
						key: uplinkKey.value || ''
					}, create: 'wifi-iface' },
					{ config: 'network', section: 'wwan', values: {
						proto: (key === 'wisp') ? 'dhcp' : 'none'
					}, create: 'interface' },
					{ config: 'network', section: 'lan', values: { ports: ports } },
					{ config: 'dhcp', section: 'lan', values: { ignore: (key === 'wisp') ? '0' : '1' } }
				],
				drops: [],
				address: null,
				wifi: true
			};
		}

		var applyBtn = w.button({ label: 'طبّق الوضع', icon: 'save', variant: 'apply' });

		applyBtn.addEventListener('click', function() {
			var key = self.selected,
			    plan = editsFor(key),
			    label = MODES.filter(function(m) { return m.key === key; })[0].title;

			if (plan.needsUplink && !self.uplink) {
				ui.addNotification(null, E('p', 'اختر الشبكة المصدر أولاً من نتائج البحث.'), 'warning');
				return;
			}

			if (key === 'ap' && apMode.value === 'static' &&
			    (!isIPv4(apIp.value) || !isIPv4(apMask.value) || !isIPv4(apGw.value))) {
				ui.addNotification(null, E('p', 'تحقّق من العنوان والقناع والبوابة.'), 'warning');
				return;
			}

			var warning = (key === 'ap')
				? (plan.address
					? 'ستصل للواجهة بعدها على %s.'.format(plan.address)
					: 'سيأخذ الجهاز عنوانه من الراوتر الرئيسي، وستحتاج لمعرفة العنوان الجديد من قائمة أجهزته.')
				: (key === 'router')
					? 'ستصل للواجهة بعدها على %s.'.format(plan.address)
					: 'ستبقى الواجهة على عنوانها الحالي، وقد ينقطع الاتصال اللاسلكي لحظة إعادة الضبط.';

			ui.showModal('تبديل وضع التشغيل', [
				E('p', 'سيتحوّل الجهاز إلى وضع «%s».'.format(label)),
				E('p', warning),
				E('p', { 'style': 'color:var(--sl-on-warn-soft);background:var(--sl-warn-soft);padding:10px 14px;border-radius:8px' },
					'إن تعذّر الوصول للواجهة بعد التبديل، أعِد الجهاز لضبط المصنع بالضغط على زر Reset لعشر ثوانٍ.'),
				E('div', { 'class': 'right' }, [
					E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.hideModal }, 'إلغاء'),
					' ',
					E('button', {
						'class': 'btn cbi-button-negative important',
						'click': function() { run(plan, label); }
					}, 'نفّذ التبديل')
				])
			]);
		});

		function run(plan, label) {
			ui.showModal('جارٍ التبديل…', [
				E('p', { 'class': 'spinning' }, 'يتم تطبيق وضع «%s»'.format(label))
			]);

			/* Sections that must exist before they can be written to. */
			var creates = plan.edits.filter(function(e) { return e.create && !((cfg[e.config] || {})[e.section]); });

			var prep = creates.length
				? Promise.all(creates.map(function(e) {
					return data.call('uci', 'add', {
						config: e.config, type: e.create, name: e.section, values: {}
					});
				}))
				: Promise.resolve();

			prep.then(function() {
				return Promise.all(plan.drops.map(function(d) {
					return ((cfg[d[0]] || {})[d[1]])
						? data.uciDelete(d[0], d[1])
						: Promise.resolve();
				}));
			}).then(function() {
				return data.save(plan.edits, { reloadNetwork: true, reloadWifi: !!plan.wifi });
			}).then(function() {
				ui.showModal('تم التبديل', [
					E('p', 'الجهاز الآن في وضع «%s».'.format(label)),
					plan.address
						? E('p', 'افتح الواجهة على http://%s/'.format(plan.address))
						: E('p', 'قد يستغرق الاتصال دقيقة حتى يستقر.'),
					E('div', { 'class': 'right' }, [
						E('a', {
							'class': 'btn cbi-button-action',
							'href': plan.address
								? ('http://' + plan.address + '/cgi-bin/luci/smartlink/home')
								: L.url('smartlink/home')
						}, 'فتح لوحة التحكم')
					])
				]);
			}).catch(function(err) {
				ui.hideModal();
				ui.addNotification(null, E('p', 'تعذّر التبديل: ' + err), 'error');
			});
		}

		select(current);

		return w.page([
			w.head({
				icon: 'bridge',
				accent: 'primary',
				title: 'وضع التشغيل',
				subtitle: 'كيف يتصرّف هذا الجهاز داخل الشبكة.'
			}),

			w.note({
				kind: 'warn',
				title: 'اقرأ قبل التبديل',
				text: 'تبديل الوضع يعيد تشكيل الشبكة، وقد يتغيّر عنوان الواجهة أو ينقطع اتصالك لحظياً. ' +
				      'نفّذه وأنت متصل سلكياً إن أمكن.'
			}),

			w.grid(4, cards.map(function(c) { return c.node; })),

			settingsHolder,

			w.card({ children: [ w.actions([ applyBtn ]) ] })
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
