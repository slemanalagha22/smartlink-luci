'use strict';
'require view';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - اكتمل الإعداد
 *
 * Reads the live state back rather than echoing what the wizard submitted, so
 * the summary reflects what the router actually ended up with.
 */

var STEPS = [ 'الترحيب', 'الإنترنت', 'الشبكة اللاسلكية', 'اكتمل' ];

return view.extend({
	load: function() {
		return data.overview();
	},

	render: function(snap) {
		var wan = snap.wan || {},
		    lan = snap.lan || {},
		    radios = (snap.radios || []).filter(function(r) { return r.up; }),
		    clients = snap.clients || [];

		var openNetworks = radios.filter(function(r) { return r.encryption === 'none'; });

		var summary = [
			[ 'الإنترنت', wan.up ? 'متصل' : 'غير متصل', wan.up ? 'lan' : 'error' ],
			[ 'عنوان الإنترنت', wan.ipaddr || '—' ],
			[ 'عنوان الراوتر', lan.ipaddr || '—' ],
			[ 'الشبكات اللاسلكية', radios.map(function(r) { return r.ssid; }).filter(Boolean).join(' · ') || '—' ],
			[ 'الأجهزة المتصلة', String(clients.length) ]
		];

		var notes = [];

		if (!wan.up)
			notes.push(w.note({
				kind: 'warn',
				title: 'الإنترنت غير متصل',
				text: 'تحقّق من كابل المزوّد، أو راجع الخطوة الأولى إن كان الاتصال يحتاج اسم مستخدم وكلمة مرور.'
			}));

		if (openNetworks.length)
			notes.push(w.note({
				kind: 'warn',
				title: 'شبكة لاسلكية بلا كلمة مرور',
				text: 'الشبكة %s مفتوحة، أي أن أي جهاز قريب يستطيع الاتصال بها. أضف كلمة مرور من الخطوة الثانية.'
					.format(openNetworks.map(function(r) { return r.ssid; }).join('، '))
			}));

		if (!notes.length)
			notes.push(w.note({
				kind: 'success',
				title: 'كل شيء جاهز',
				text: 'الراوتر متصل بالإنترنت وشبكاتك اللاسلكية مؤمّنة.'
			}));

		return w.page([
			w.steps(STEPS, 3),

			w.card({
				children: [
					w.hero({
						icon: 'done',
						accent: 'lan',
						title: 'اكتمل الإعداد',
						subtitle: 'راوترك جاهز للاستخدام. هذه خلاصة ما تم ضبطه.'
					}),

					E('div', { 'style': 'max-inline-size:640px;margin-inline:auto' }, [ w.kv(summary) ]),

					w.actions([
						w.button({ label: 'الذهاب إلى لوحة التحكم', icon: 'next', variant: 'apply', href: L.url('smartlink/home') }),
						w.button({ label: 'إعادة الإعداد', icon: 'back', href: L.url('smartlink/setup/welcome') })
					])
				]
			})
		].concat(notes));
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
