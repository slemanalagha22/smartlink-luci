'use strict';
'require view';
'require ui';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - الإعداد، الخطوة 2: الشبكة اللاسلكية
 *
 * One name and password per band. The password field starts empty and an
 * empty field keeps whatever is already stored, so a user stepping through
 * the wizard a second time does not have to retype a password they cannot see.
 */

var STEPS = [ 'الترحيب', 'وضع التشغيل', 'الاتصال', 'الشبكة اللاسلكية', 'اكتمل' ];

var ENCRYPTIONS = [
	[ 'psk2',      'WPA2-PSK (موصى به)' ],
	[ 'sae-mixed', 'WPA2/WPA3 مختلط' ],
	[ 'none',      'شبكة مفتوحة' ]
];

function bandTitle(band) {
	return (band === '5') ? 'شبكة 5 غيغاهرتز' : 'شبكة 2.4 غيغاهرتز';
}

return view.extend({
	load: function() {
		return data.overview();
	},

	render: function(snap) {
		var self = this,
		    radios = (snap.radios || []).filter(function(r) { return !!r.section; });

		if (!radios.length) {
			return w.page([
				w.steps(STEPS, 3),
				w.note({ kind: 'warn', title: 'لا توجد واجهة لاسلكية', text: 'لم يبلّغ الجهاز عن أي راديو يمكن ضبطه.' }),
				w.card({ children: [ w.actions([
					w.button({ label: 'متابعة', icon: 'next', variant: 'apply', href: L.url('smartlink/setup/done') })
				]) ] })
			]);
		}

		this.controls = [];

		var sameToggle = w.toggle({ id: 'w2-same', checked: true, label: 'استخدم نفس الاسم وكلمة المرور للنطاقين' });

		var cards = radios.map(function(radio, index) {
			var ctl = { radio: radio };

			ctl.ssid = w.input({ id: 'w2-ssid-' + index, value: radio.ssid || '' });
			ctl.enc = w.select({ id: 'w2-enc-' + index, value: radio.encryption === 'sae' ? 'sae-mixed' : radio.encryption, options: ENCRYPTIONS });
			ctl.key = w.input({ id: 'w2-key-' + index, type: 'password', value: '', placeholder: 'اتركها فارغة للإبقاء على الحالية' });

			self.controls.push(ctl);

			var keyField = w.field({ label: 'كلمة المرور', control: ctl.key, hint: 'ثمانية محارف على الأقل.' });

			function syncKey() {
				keyField.style.display = (ctl.enc.value === 'none') ? 'none' : '';
			}

			ctl.enc.addEventListener('change', syncKey);
			syncKey();

			return w.card({
				title: bandTitle(radio.band),
				desc: 'القناة %s'.format(radio.channel || '—'),
				children: [
					w.fields([
						w.field({ label: 'اسم الشبكة (SSID)', control: ctl.ssid }),
						w.field({ label: 'الأمان', control: ctl.enc }),
						keyField
					])
				]
			});
		});

		/* Mirror the first band onto the rest while the toggle is on. */
		function mirror() {
			if (!sameToggle.querySelector('input').checked || self.controls.length < 2)
				return;

			var first = self.controls[0];

			self.controls.slice(1).forEach(function(ctl) {
				ctl.ssid.value = first.ssid.value;
				ctl.key.value = first.key.value;
				ctl.enc.value = first.enc.value;
			});
		}

		if (this.controls.length > 1) {
			this.controls[0].ssid.addEventListener('input', mirror);
			this.controls[0].key.addEventListener('input', mirror);
			this.controls[0].enc.addEventListener('change', mirror);
			sameToggle.querySelector('input').addEventListener('change', mirror);
			mirror();
		}

		var nextBtn = w.button({ label: 'حفظ وإنهاء', icon: 'save', variant: 'apply' });

		nextBtn.addEventListener('click', function() {
			var edits = [],
			    problem = null;

			self.controls.forEach(function(ctl) {
				var ssid = ctl.ssid.value.trim(),
				    enc = ctl.enc.value,
				    key = ctl.key.value;

				if (!ssid) {
					problem = problem || 'اسم الشبكة مطلوب.';
					return;
				}

				if (enc !== 'none') {
					if (key && key.length < 8)
						problem = problem || 'كلمة المرور يجب أن تكون ثمانية محارف على الأقل.';
					else if (!key && ctl.radio.encryption === 'none')
						problem = problem || 'اختر كلمة مرور عند تفعيل التشفير لأول مرة.';
				}

				var values = { ssid: ssid, encryption: enc };

				if (enc === 'none')
					values.key = '';
				else if (key)
					values.key = key;

				edits.push({ config: 'wireless', section: ctl.radio.section, values: values });

				/* A wizard should leave the radio on. */
				edits.push({ config: 'wireless', section: ctl.radio.radio, values: { disabled: '0' } });
			});

			if (problem) {
				ui.addNotification(null, E('p', problem), 'warning');
				return;
			}

			nextBtn.disabled = true;
			ui.showModal('جارٍ الحفظ…', [ E('p', { 'class': 'spinning' }, 'يتم تطبيق إعدادات الشبكة اللاسلكية') ]);

			data.save(edits, { reloadWifi: true, reloadNetwork: false })
				.then(function() {
					ui.hideModal();
					window.location.href = L.url('smartlink/setup/done');
				})
				.catch(function(err) {
					ui.hideModal();
					nextBtn.disabled = false;
					ui.addNotification(null, E('p', 'تعذّر الحفظ: ' + err), 'error');
				});
		});

		return w.page([
			w.steps(STEPS, 3),

			w.head({
				icon: 'wifi',
				accent: 'wireless',
				title: 'الخطوة 3 — الشبكة اللاسلكية',
				subtitle: 'اختر اسماً تتعرّف عليه أجهزتك وكلمة مرور قوية.'
			}),

			w.grid(3, [
				E('div', { 'class': 'sl-span-2', 'style': 'display:grid;gap:var(--sl-gutter)' },
					(radios.length > 1
						? [ w.card({ children: [ w.fields([ w.field({ label: 'توحيد النطاقين', control: sameToggle, wide: true }) ], true) ] }) ]
						: []
					).concat(cards).concat([
						w.card({ children: [ w.actions([
							w.button({ label: 'رجوع', icon: 'back', href: L.url('smartlink/setup/step1') }),
							E('span', { 'class': 'sl-actions-end' }, [ nextBtn ])
						]) ] })
					])),

				w.note({
					kind: 'info',
					title: 'كلمة مرور جيدة',
					items: [
						'ثمانية محارف على الأقل، والأفضل اثنا عشر.',
						'امزج أحرفاً وأرقاماً ورموزاً.',
						'تجنّب اسم الشبكة أو رقم الهاتف داخل كلمة المرور.'
					]
				})
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
