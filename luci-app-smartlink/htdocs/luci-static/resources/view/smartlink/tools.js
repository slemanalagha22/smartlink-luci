'use strict';
'require view';
'require ui';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - الأدوات
 *
 * Maintenance actions. Everything on this page does what its label says: the
 * restart buttons call ubus, the log viewer reads the real ring buffer. The
 * two entries that hand off to LuCI (backup, firmware) are marked as links
 * rather than dressed up as local actions.
 */

function confirm(title, body, confirmLabel, onConfirm) {
	ui.showModal(title, [
		E('p', body),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.hideModal }, 'إلغاء'),
			' ',
			E('button', {
				'class': 'btn cbi-button-negative important',
				'click': function() { onConfirm(); }
			}, confirmLabel)
		])
	]);
}

return view.extend({
	load: function() {
		return data.overview();
	},

	render: function(snap) {
		var board = snap.board || {},
		    rel = board.release || {};

		function busy(message) {
			ui.showModal('جارٍ التنفيذ…', [ E('p', { 'class': 'spinning' }, message) ]);
		}

		function done(message) {
			ui.hideModal();
			ui.addNotification(null, E('p', message), 'info');
		}

		function fail(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', 'تعذّر التنفيذ: ' + err), 'error');
		}

		/* ---- actions ---- */

		var actions = [
			{
				icon: 'restart', accent: 'error', title: 'إعادة تشغيل الراوتر',
				hint: 'ينقطع الاتصال لدقيقة أو دقيقتين.',
				label: 'إعادة التشغيل',
				variant: 'remove',
				run: function() {
					confirm('إعادة تشغيل الراوتر',
						'سيُعاد تشغيل الجهاز وتنقطع كل الاتصالات مؤقتاً.',
						'أعد التشغيل الآن',
						function() {
							busy('بانتظار الجهاز');
							data.call('system', 'reboot');
						});
				}
			},
			{
				icon: 'refresh', accent: 'primary', title: 'إعادة تشغيل الشبكة',
				hint: 'يعيد تحميل إعدادات الشبكة دون إعادة تشغيل.',
				label: 'إعادة التحميل',
				variant: 'action',
				run: function() {
					busy('يتم إعادة تحميل الشبكة');
					data.call('network', 'reload').then(function() {
						done('أُعيد تحميل إعدادات الشبكة.');
					}).catch(fail);
				}
			},
			{
				icon: 'wifi', accent: 'wireless', title: 'إعادة ضبط الراديوهات',
				hint: 'يعيد تكوين الواجهات اللاسلكية.',
				label: 'إعادة الضبط',
				variant: 'action',
				run: function() {
					busy('يتم إعادة ضبط الراديوهات');
					data.call('network.wireless', 'reconf').then(function() {
						done('أُعيد ضبط الواجهات اللاسلكية.');
					}).catch(fail);
				}
			},
			{
				icon: 'logs', accent: 'devices', title: 'سجل النظام',
				hint: 'آخر الأحداث المسجّلة على الجهاز.',
				label: 'عرض السجل',
				variant: 'neutral',
				run: function() {
					busy('يتم جلب السجل');

					data.call('file', 'exec', { command: '/sbin/logread', params: [ '-l', '120' ] })
						.then(function(r) {
							ui.hideModal();

							var text = (r && r.stdout) || 'لا توجد مخرجات.';

							ui.showModal('سجل النظام', [
								E('pre', { 'style': 'max-height:60vh;overflow:auto;direction:ltr;text-align:left' }, text),
								E('div', { 'class': 'right' }, [
									E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.hideModal }, 'إغلاق')
								])
							]);
						})
						.catch(fail);
				}
			}
		];

		var links = [
			[ 'save',    'نسخة احتياطية', 'حفظ أو استعادة ملفات الإعدادات', L.url('admin/system/flash') ],
			[ 'upgrade', 'تحديث البرنامج', 'تثبيت صورة فيرموير جديدة',      L.url('admin/system/flash') ],
			[ 'key',     'كلمة مرور الإدارة', 'ضبط كلمة مرور الدخول',       L.url('admin/system/admin') ],
			[ 'settings','إعدادات النظام', 'الاسم والوقت والمنطقة الزمنية', L.url('admin/system/system') ]
		];

		return w.page([
			w.head({
				icon: 'tools',
				accent: 'gold',
				title: 'الأدوات',
				subtitle: 'صيانة الجهاز وتشخيص المشاكل.'
			}),

			w.grid(2, actions.map(function(a) {
				var btn = w.button({ label: a.label, variant: a.variant, click: a.run });

				return w.card({
					class: 'sl-accent-' + a.accent,
					children: [
						E('div', { 'style': 'display:flex;align-items:center;gap:14px;margin-block-end:14px' }, [
							E('div', { 'class': 'sl-stat-icon' }, [ w.icon(a.icon) ]),
							E('div', {}, [
								E('div', { 'class': 'sl-device-name' }, a.title),
								E('div', { 'class': 'sl-device-sub' }, a.hint)
							])
						]),
						btn
					]
				});
			})),

			w.card({
				title: 'معلومات الجهاز',
				children: [
					w.kv([
						[ 'الطراز', board.model || '—' ],
						[ 'المعالج', board.system || '—' ],
						[ 'النواة', board.kernel || '—' ],
						[ 'إصدار البرنامج', rel.description || rel.version || '—' ],
						[ 'اسم الجهاز', board.hostname || '—' ]
					])
				]
			}),

			w.card({
				title: 'صيانة متقدمة',
				desc: 'تفتح في صفحات LuCI الأصلية.',
				children: [
					w.grid(4, links.map(function(l) {
						return w.tile({ accent: 'primary', icon: l[0], title: l[1], value: '', hint: l[2], href: l[3] });
					}))
				]
			})
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
