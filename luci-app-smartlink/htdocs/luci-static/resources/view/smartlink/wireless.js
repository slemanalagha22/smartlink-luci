'use strict';
'require view';
'require ui';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - إعدادات الشبكة اللاسلكية
 *
 * Edits go straight to uci: the radio's `disabled` flag on the wifi-device
 * section, and ssid / encryption / key / hidden on its access-point interface.
 * Saving commits wireless and asks netifd to reconfigure the radios, which is
 * what makes the change take effect without a reboot.
 */

var ENCRYPTIONS = [
	[ 'psk2',      'WPA2-PSK' ],
	[ 'sae-mixed', 'WPA2/WPA3 مختلط' ],
	[ 'sae',       'WPA3-SAE' ],
	[ 'none',      'شبكة مفتوحة (بدون كلمة مرور)' ]
];

function bandLabel(band) {
	return (band === '5') ? 'شبكة 5 غيغاهرتز' : 'شبكة 2.4 غيغاهرتز';
}

return view.extend({
	load: function() {
		return data.overview();
	},

	render: function(snap) {
		var self = this,
		    radios = snap.radios || [];

		if (!radios.length) {
			return w.page([
				w.head({ icon: 'wifi', accent: 'wireless', title: 'إعدادات الشبكة اللاسلكية' }),
				w.note({ kind: 'warn', title: 'لا توجد واجهة لاسلكية', text: 'لم يبلّغ الجهاز عن أي راديو لاسلكي.' })
			]);
		}

		this.controls = [];

		var cards = radios.map(function(radio) {
			var idBase = 'sl-' + radio.radio,
			    ctl = { radio: radio };

			ctl.enabled = w.toggle({ id: idBase + '-on', checked: radio.up, label: radio.up ? 'مفعّلة' : 'متوقفة' });
			ctl.ssid = w.input({ id: idBase + '-ssid', value: radio.ssid || '' });
			ctl.encryption = w.select({ id: idBase + '-enc', value: radio.encryption, options: ENCRYPTIONS });
			ctl.key = w.input({ id: idBase + '-key', type: 'password', value: '', placeholder: 'اتركها فارغة للإبقاء على الحالية' });
			ctl.hidden = w.toggle({ id: idBase + '-hide', checked: radio.hidden, label: 'إخفاء اسم الشبكة' });

			/* Keep the toggle's own caption honest as it is flipped. */
			ctl.enabled.querySelector('input').addEventListener('change', function(ev) {
				ctl.enabled.querySelector('span:last-child').textContent = ev.target.checked ? 'مفعّلة' : 'متوقفة';
			});

			var keyField = w.field({
				label: 'كلمة المرور',
				control: ctl.key,
				hint: 'ثمانية محارف على الأقل. اتركها فارغة إذا لم ترد تغييرها.'
			});

			function syncKeyVisibility() {
				keyField.style.display = (ctl.encryption.value === 'none') ? 'none' : '';
			}

			ctl.encryption.addEventListener('change', syncKeyVisibility);
			syncKeyVisibility();

			self.controls.push(ctl);

			return w.card({
				title: bandLabel(radio.band),
				desc: 'القناة %s · %d جهاز متصل'.format(radio.channel || '—', (radio.stations || []).length),
				children: [
					w.fields([
						w.field({ label: 'حالة الشبكة', control: ctl.enabled }),
						w.field({ label: 'إخفاء الشبكة', control: ctl.hidden }),
						w.field({ label: 'اسم الشبكة (SSID)', control: ctl.ssid, hint: 'الاسم الظاهر للأجهزة عند البحث.' }),
						w.field({ label: 'الأمان', control: ctl.encryption }),
						keyField
					])
				]
			});
		});

		/* ---- status side panel ---- */

		var totalStations = radios.reduce(function(n, r) { return n + (r.stations || []).length; }, 0),
		    best = radios.reduce(function(acc, r) {
		        return (r.signal != null && (acc === null || r.signal > acc)) ? r.signal : acc;
		    }, null);

		var statusCard = w.card({
			title: 'نظرة عامة على الحالة',
			children: [
				w.kv([
					[ 'الأجهزة المتصلة', '%d جهاز'.format(totalStations) ],
					[ 'عدد الراديوهات', String(radios.length) ],
					[ 'أقوى إشارة', best != null ? '%d dBm'.format(best) : '—' ]
				]),
				E('div', { 'style': 'margin-block-start:16px' }, [
					w.bar(best != null ? Math.max(5, Math.min(100, 2 * (best + 100))) : 0, 'wireless')
				])
			]
		});

		var tips = w.note({
			kind: 'info',
			title: 'نصائح الأمان',
			items: [
				'استخدم كلمة مرور قوية تحتوي على أحرف وأرقام ورموز.',
				'يُنصح بترك القناة على وضع تلقائي لتجنّب التداخل مع الشبكات المجاورة.',
				'إخفاء SSID يزيد من صعوبة العثور على شبكتك، لكنه ليس بديلاً عن التشفير.'
			]
		});

		/* ---- save ---- */

		var saveBtn = w.button({ label: 'حفظ التغييرات', icon: 'save', variant: 'apply' });

		saveBtn.addEventListener('click', function() {
			var edits = [],
			    problem = null;

			self.controls.forEach(function(ctl) {
				var on = ctl.enabled.querySelector('input').checked,
				    ssid = ctl.ssid.value.trim(),
				    enc = ctl.encryption.value,
				    key = ctl.key.value;

				edits.push({
					config: 'wireless',
					section: ctl.radio.radio,
					values: { disabled: on ? '0' : '1' }
				});

				if (!on || !ctl.radio.section)
					return;

				if (!ssid)
					problem = problem || 'اسم الشبكة مطلوب لكل راديو مفعّل.';

				if (enc !== 'none' && key && key.length < 8)
					problem = problem || 'كلمة المرور يجب أن تكون ثمانية محارف على الأقل.';

				if (enc !== 'none' && !key && ctl.radio.encryption === 'none')
					problem = problem || 'اختر كلمة مرور عند تفعيل التشفير لأول مرة.';

				var values = {
					ssid: ssid,
					encryption: enc,
					hidden: ctl.hidden.querySelector('input').checked ? '1' : '0'
				};

				/* An empty password field means "leave the stored one alone". */
				if (enc === 'none')
					values.key = '';
				else if (key)
					values.key = key;

				edits.push({ config: 'wireless', section: ctl.radio.section, values: values });
			});

			if (problem) {
				ui.addNotification(null, E('p', problem), 'warning');
				return;
			}

			saveBtn.disabled = true;
			ui.showModal('جارٍ الحفظ…', [ E('p', { 'class': 'spinning' }, 'يتم تطبيق إعدادات الشبكة اللاسلكية') ]);

			data.save(edits, { reloadWifi: true, reloadNetwork: false }).then(function() {
				ui.hideModal();
				saveBtn.disabled = false;
				ui.addNotification(null, E('p', 'حُفظت الإعدادات وأُعيد ضبط الراديوهات. قد ينقطع اتصالك اللاسلكي لثوانٍ.'), 'info');
			}).catch(function(err) {
				ui.hideModal();
				saveBtn.disabled = false;
				ui.addNotification(null, E('p', 'تعذّر الحفظ: ' + err), 'error');
			});
		});

		return w.page([
			w.head({
				icon: 'wifi',
				accent: 'wireless',
				title: 'إعدادات الشبكة اللاسلكية',
				subtitle: 'تكوين نطاقات التردد ومعلمات الأمان للواجهات اللاسلكية.'
			}),
			w.grid(3, [
				E('div', { 'class': 'sl-span-2', 'style': 'display:grid;gap:var(--sl-gutter)' },
					cards.concat([ w.card({ children: [ w.actions([ saveBtn ]) ] }) ])),
				E('div', { 'style': 'display:grid;gap:var(--sl-gutter);align-content:start' }, [ statusCard, tips ])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
