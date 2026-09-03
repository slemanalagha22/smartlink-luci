'use strict';
'require view';
'require smartlink.data as data';
'require smartlink.widgets as w';

/* SMARTLink - مرحباً (الخطوة صفر من معالج الإعداد) */

var STEPS = [ 'الترحيب', 'وضع التشغيل', 'الاتصال', 'الشبكة اللاسلكية', 'اكتمل' ];

return view.extend({
	load: function() {
		return data.overview();
	},

	render: function(snap) {
		var board = snap.board || {},
		    wan = snap.wan || {},
		    radios = snap.radios || [];

		return w.page([
			w.steps(STEPS, 0),

			w.card({
				children: [
					w.hero({
						icon: 'router',
						accent: 'primary',
						title: 'مرحباً بك في SMARTLink',
						subtitle: 'ثلاث خطوات قصيرة لتجهيز الراوتر: الاتصال بالإنترنت، ثم الشبكة اللاسلكية.'
					}),

					E('div', { 'style': 'max-inline-size:640px;margin-inline:auto' }, [
						w.kv([
							[ 'الطراز', board.model || '—' ],
							[ 'إصدار البرنامج', (board.release && board.release.description) || '—' ],
							[ 'حالة الإنترنت', wan.up ? 'متصل' : 'غير متصل', wan.up ? 'lan' : 'error' ],
							[ 'الواجهات اللاسلكية', String(radios.length) ]
						])
					]),

					w.actions([
						w.button({
							label: 'ابدأ الإعداد',
							icon: 'next',
							variant: 'apply',
							href: L.url('smartlink/setup/mode')
						}),
						E('span', { 'class': 'sl-actions-end' }, [
							w.button({ label: 'تخطّي إلى لوحة التحكم', href: L.url('smartlink/home') })
						])
					])
				]
			}),

			w.note({
				kind: 'info',
				title: 'ماذا سيحدث؟',
				items: [
					'الخطوة 1: اختيار وضع تشغيل الجهاز — راوتر أو نقطة وصول أو مقوٍّ.',
					'الخطوة 2: إعداد الاتصال بحسب الوضع المختار.',
					'كل خطوة تُحفظ فور الضغط على «التالي»، ويمكنك العودة وتعديلها لاحقاً.'
				]
			})
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
