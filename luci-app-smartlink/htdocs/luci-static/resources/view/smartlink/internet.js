'use strict';
'require view';
'require poll';
'require ui';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - الإنترنت
 *
 * The WAN interface: how it gets its address, and what it currently has.
 * Only the fields that belong to the selected protocol are written, and the
 * ones that belong to the other protocols are cleared, so switching from
 * PPPoE back to DHCP does not leave stale credentials in the config.
 */

var PROTOCOLS = [
	[ 'dhcp',   'تلقائي (DHCP)' ],
	[ 'pppoe',  'PPPoE' ],
	[ 'static', 'عنوان ثابت' ]
];

function isIPv4(value) {
	var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(value || '').trim());

	if (!m)
		return false;

	for (var i = 1; i <= 4; i++)
		if (parseInt(m[i], 10) > 255)
			return false;

	return true;
}

return view.extend({
	load: function() {
		return Promise.all([
			data.overview(),
			data.call('uci', 'get', { config: 'network', section: 'wan' })
		]);
	},

	render: function(res) {
		var self = this,
		    snap = res[0],
		    cfg = (res[1] && res[1].values) || {},
		    wan = snap.wan || {};

		var proto = w.select({ id: 'sl-wan-proto', value: cfg.proto || 'dhcp', options: PROTOCOLS }),
		    user  = w.input({ id: 'sl-wan-user', value: cfg.username || '' }),
		    pass  = w.input({ id: 'sl-wan-pass', type: 'password', value: '', placeholder: 'اتركها فارغة للإبقاء على الحالية' }),
		    ip    = w.input({ id: 'sl-wan-ip', value: cfg.ipaddr || '' }),
		    mask  = w.input({ id: 'sl-wan-mask', value: cfg.netmask || '255.255.255.0' }),
		    gw    = w.input({ id: 'sl-wan-gw', value: cfg.gateway || '' }),
		    dns   = w.input({ id: 'sl-wan-dns', value: [].concat(cfg.dns || []).join(' '), placeholder: '1.1.1.1 8.8.8.8' });

		var pppoeFields = w.fields([
			w.field({ label: 'اسم المستخدم', control: user }),
			w.field({ label: 'كلمة المرور', control: pass })
		]);

		var staticFields = w.fields([
			w.field({ label: 'عنوان IPv4', control: ip }),
			w.field({ label: 'قناع الشبكة', control: mask }),
			w.field({ label: 'البوابة', control: gw }),
			w.field({ label: 'خوادم DNS', control: dns, hint: 'مفصولة بمسافة. اتركها فارغة لاستخدام ما يوفّره المزوّد.' })
		]);

		function syncProto() {
			var v = proto.value;
			pppoeFields.style.display = (v === 'pppoe') ? '' : 'none';
			staticFields.style.display = (v === 'static') ? '' : 'none';
		}

		proto.addEventListener('change', syncProto);
		syncProto();

		/* ---- live status ---- */

		var stateChip = w.chip(wan.up ? 'متصل' : 'غير متصل', wan.up ? 'lan' : 'error'),
		    kvAddr = E('span', { 'class': 'sl-kv-val' }, wan.ipaddr || '—'),
		    kvGw   = E('span', { 'class': 'sl-kv-val' }, wan.gateway || '—'),
		    kvUp   = E('span', { 'class': 'sl-kv-val' }, data.formatUptime(wan.uptime) || '—'),
		    kvDev  = E('span', { 'class': 'sl-kv-val' }, wan.device || '—');

		var statusCard = w.card({
			title: 'حالة الاتصال',
			children: [
				E('div', { 'style': 'margin-block-end:14px' }, [ stateChip ]),
				E('ul', { 'class': 'sl-kv' }, [
					E('li', {}, [ E('span', { 'class': 'sl-kv-key' }, 'عنوان IP:'), kvAddr ]),
					E('li', {}, [ E('span', { 'class': 'sl-kv-key' }, 'البوابة:'), kvGw ]),
					E('li', {}, [ E('span', { 'class': 'sl-kv-key' }, 'مدة الاتصال:'), kvUp ]),
					E('li', {}, [ E('span', { 'class': 'sl-kv-key' }, 'الواجهة:'), kvDev ])
				])
			]
		});

		poll.add(function() {
			return data.overview().then(function(s) {
				var n = s.wan || {};

				stateChip.textContent = n.up ? 'متصل' : 'غير متصل';
				stateChip.className = 'sl-chip ' + (n.up ? 'sl-accent-lan' : 'sl-accent-error');
				kvAddr.textContent = n.ipaddr || '—';
				kvGw.textContent = n.gateway || '—';
				kvUp.textContent = data.formatUptime(n.uptime) || '—';
				kvDev.textContent = n.device || '—';
			});
		}, 5);

		/* ---- save ---- */

		var saveBtn = w.button({ label: 'حفظ التغييرات', icon: 'save', variant: 'apply' });

		saveBtn.addEventListener('click', function() {
			var v = proto.value,
			    values = { proto: v };

			if (v === 'pppoe') {
				if (!user.value.trim()) {
					ui.addNotification(null, E('p', 'اسم مستخدم PPPoE مطلوب.'), 'warning');
					return;
				}

				values.username = user.value.trim();

				if (pass.value)
					values.password = pass.value;
				else if (!cfg.password) {
					ui.addNotification(null, E('p', 'كلمة مرور PPPoE مطلوبة.'), 'warning');
					return;
				}
			}
			else {
				values.username = '';
				values.password = '';
			}

			if (v === 'static') {
				if (!isIPv4(ip.value) || !isIPv4(mask.value) || !isIPv4(gw.value)) {
					ui.addNotification(null, E('p', 'تحقّق من العنوان والقناع والبوابة.'), 'warning');
					return;
				}

				values.ipaddr = ip.value.trim();
				values.netmask = mask.value.trim();
				values.gateway = gw.value.trim();

				var servers = dns.value.trim().split(/\s+/).filter(Boolean);

				if (servers.length && !servers.every(isIPv4)) {
					ui.addNotification(null, E('p', 'أحد خوادم DNS غير صالح.'), 'warning');
					return;
				}

				values.dns = servers.join(' ');
			}
			else {
				values.ipaddr = '';
				values.netmask = '';
				values.gateway = '';
				values.dns = '';
			}

			saveBtn.disabled = true;
			ui.showModal('جارٍ الحفظ…', [ E('p', { 'class': 'spinning' }, 'يتم إعادة تكوين اتصال الإنترنت') ]);

			data.save([ { config: 'network', section: 'wan', values: values } ], { reloadNetwork: true })
				.then(function() {
					ui.hideModal();
					saveBtn.disabled = false;
					cfg = Object.assign(cfg, values);
					ui.addNotification(null, E('p', 'حُفظت الإعدادات. قد يستغرق الاتصال بضع ثوانٍ ليعود.'), 'info');
				})
				.catch(function(err) {
					ui.hideModal();
					saveBtn.disabled = false;
					ui.addNotification(null, E('p', 'تعذّر الحفظ: ' + err), 'error');
				});
		});

		return w.page([
			w.head({
				icon: 'internet',
				accent: 'internet',
				title: 'إعدادات الإنترنت',
				subtitle: 'طريقة حصول الراوتر على اتصاله من مزوّد الخدمة.'
			}),
			w.grid(3, [
				E('div', { 'class': 'sl-span-2', 'style': 'display:grid;gap:var(--sl-gutter)' }, [
					w.card({
						title: 'نوع الاتصال',
						children: [
							w.fields([ w.field({ label: 'البروتوكول', control: proto, wide: true }) ], true),
							pppoeFields,
							staticFields
						]
					}),
					w.card({ children: [ w.actions([ saveBtn ]) ] })
				]),
				E('div', { 'style': 'display:grid;gap:var(--sl-gutter);align-content:start' }, [
					statusCard,
					w.note({
						kind: 'info',
						title: 'أي نوع أختار؟',
						items: [
							'تلقائي (DHCP): الخيار الشائع مع معظم المزوّدين.',
							'PPPoE: يحتاج اسم مستخدم وكلمة مرور من المزوّد.',
							'عنوان ثابت: عندما يمنحك المزوّد عنواناً محدداً.'
						]
					})
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
