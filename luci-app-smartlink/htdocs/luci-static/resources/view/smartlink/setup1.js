'use strict';
'require view';
'require ui';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - الإعداد، الخطوة 1: الإنترنت
 *
 * Writes the WAN protocol and its fields, then moves on. The step commits as
 * it advances rather than collecting a draft across pages: each LuCI view is
 * a separate page load, and a half-finished wizard should still leave the
 * router in a state the user chose.
 */

var STEPS = [ 'الترحيب', 'الإنترنت', 'الشبكة اللاسلكية', 'اكتمل' ];

var PROTOCOLS = [
	[ 'dhcp',   'تلقائي (DHCP) — الأكثر شيوعاً' ],
	[ 'pppoe',  'PPPoE — باسم مستخدم وكلمة مرور' ],
	[ 'static', 'عنوان ثابت من المزوّد' ]
];

function isIPv4(v) {
	var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(v || '').trim());
	if (!m) return false;
	for (var i = 1; i <= 4; i++) if (parseInt(m[i], 10) > 255) return false;
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
		var snap = res[0],
		    cfg = (res[1] && res[1].values) || {},
		    wan = snap.wan || {};

		var proto = w.select({ id: 'w1-proto', value: cfg.proto || 'dhcp', options: PROTOCOLS }),
		    user  = w.input({ id: 'w1-user', value: cfg.username || '' }),
		    pass  = w.input({ id: 'w1-pass', type: 'password', value: '', placeholder: 'اتركها فارغة للإبقاء على الحالية' }),
		    ip    = w.input({ id: 'w1-ip', value: cfg.ipaddr || '' }),
		    mask  = w.input({ id: 'w1-mask', value: cfg.netmask || '255.255.255.0' }),
		    gw    = w.input({ id: 'w1-gw', value: cfg.gateway || '' });

		var pppoe = w.fields([
			w.field({ label: 'اسم المستخدم', control: user }),
			w.field({ label: 'كلمة المرور', control: pass })
		]);

		var fixed = w.fields([
			w.field({ label: 'عنوان IPv4', control: ip }),
			w.field({ label: 'قناع الشبكة', control: mask }),
			w.field({ label: 'البوابة', control: gw, wide: true })
		]);

		function sync() {
			pppoe.style.display = (proto.value === 'pppoe') ? '' : 'none';
			fixed.style.display = (proto.value === 'static') ? '' : 'none';
		}

		proto.addEventListener('change', sync);
		sync();

		var nextBtn = w.button({ label: 'التالي', icon: 'next', variant: 'apply' });

		nextBtn.addEventListener('click', function() {
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
			}
			else {
				values.ipaddr = '';
				values.netmask = '';
				values.gateway = '';
			}

			nextBtn.disabled = true;
			ui.showModal('جارٍ الحفظ…', [ E('p', { 'class': 'spinning' }, 'يتم تطبيق إعدادات الإنترنت') ]);

			data.save([ { config: 'network', section: 'wan', values: values } ], { reloadNetwork: true })
				.then(function() {
					ui.hideModal();
					window.location.href = L.url('smartlink/setup/step2');
				})
				.catch(function(err) {
					ui.hideModal();
					nextBtn.disabled = false;
					ui.addNotification(null, E('p', 'تعذّر الحفظ: ' + err), 'error');
				});
		});

		return w.page([
			w.steps(STEPS, 1),

			w.head({
				icon: 'internet',
				accent: 'internet',
				title: 'الخطوة 1 — الاتصال بالإنترنت',
				subtitle: 'اختر الطريقة التي يمنحك بها مزوّد الخدمة الاتصال.'
			}),

			w.grid(3, [
				E('div', { 'class': 'sl-span-2' }, [
					w.card({
						children: [
							w.fields([ w.field({ label: 'نوع الاتصال', control: proto, wide: true }) ], true),
							pppoe,
							fixed,
							w.actions([
								w.button({ label: 'رجوع', icon: 'back', href: L.url('smartlink/setup') }),
								E('span', { 'class': 'sl-actions-end' }, [ nextBtn ])
							])
						]
					})
				]),
				w.card({
					title: 'الحالة الحالية',
					children: [
						w.kv([
							[ 'الاتصال', wan.up ? 'متصل' : 'غير متصل', wan.up ? 'lan' : 'error' ],
							[ 'البروتوكول', String(cfg.proto || 'dhcp').toUpperCase() ],
							[ 'عنوان IP', wan.ipaddr || '—' ]
						])
					]
				})
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
