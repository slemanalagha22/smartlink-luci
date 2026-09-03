'use strict';
'require view';
'require ui';
'require smartlink.data as data';
'require smartlink.modes as modes';
'require smartlink.widgets as w';

/*
 * SMARTLink - الإعداد، الخطوة 1: وضع التشغيل
 *
 * Choosing only. Nothing is written here: the mode decides which connection
 * form the next step shows, and both are applied together there. Applying a
 * mode the moment it is clicked would drop the connection in the middle of
 * the wizard, which is a poor way to treat someone who is halfway through
 * setting up their router.
 */

var STEPS = [ 'الترحيب', 'وضع التشغيل', 'الاتصال', 'الشبكة اللاسلكية', 'اكتمل' ];

return view.extend({
	load: function() {
		return Promise.all([
			data.modeConfig(),
			data.hasPackage('relayd')
		]);
	},

	render: function(res) {
		var self = this,
		    cfg = res[0],
		    hasRelayd = res[1],
		    current = modes.detect(cfg);

		this.selected = modes.recallChoice(current);

		var cards = modes.list.map(function(m) {
			var unavailable = (m.requires === 'relayd' && !hasRelayd);

			var node = E('button', {
				'type': 'button',
				'class': 'sl-mode sl-accent-' + m.accent + (unavailable ? ' is-unavailable' : ''),
				'disabled': unavailable ? '' : null
			}, [
				(m.key === current) ? E('span', { 'class': 'sl-mode-tag' }, 'الوضع الحالي') : '',
				E('div', { 'class': 'sl-mode-icon' }, [ w.icon(m.icon) ]),
				E('div', { 'class': 'sl-mode-title' }, m.title),
				E('div', { 'class': 'sl-mode-desc' }, m.desc),
				unavailable
					? E('div', { 'class': 'sl-field-error' }, 'يحتاج حزمة relayd غير المثبّتة على هذا الجهاز.')
					: ''
			]);

			if (!unavailable)
				node.addEventListener('click', function() { pick(m.key); });

			return { key: m.key, node: node, unavailable: unavailable };
		});

		var summary = E('p', { 'class': 'sl-tile-hint' }, '');

		function pick(key) {
			self.selected = key;
			modes.rememberChoice(key);

			cards.forEach(function(c) {
				c.node.classList.toggle('is-current', c.key === key);
			});

			var m = modes.byKey(key);

			summary.textContent = (key === current)
				? 'هذا هو الوضع الحالي للجهاز. يمكنك المتابعة لمراجعة إعداداته.'
				: 'سيتحوّل الجهاز إلى وضع «%s» عند إتمام الخطوة التالية.'.format(m.title);
		}

		pick(this.selected);

		return w.page([
			w.steps(STEPS, 1),

			w.head({
				icon: 'bridge',
				accent: 'primary',
				title: 'وضع التشغيل',
				subtitle: 'كيف يتصرّف هذا الجهاز داخل الشبكة. اختيارك هنا يحدّد ما تسأل عنه الخطوة التالية.'
			}),

			w.grid(4, cards.map(function(c) { return c.node; })),

			w.card({
				children: [
					summary,
					w.actions([
						w.button({ label: 'رجوع', icon: 'back', href: L.url('smartlink/setup') }),
						E('span', { 'class': 'sl-actions-end' }, [
							w.button({
								label: 'التالي',
								icon: 'next',
								variant: 'apply',
								href: L.url('smartlink/setup/step1')
							})
						])
					])
				]
			}),

			w.note({
				kind: 'warn',
				title: 'قبل تغيير الوضع',
				text: 'تغيير الوضع يعيد تشكيل الشبكة، وقد يتغيّر عنوان الواجهة أو ينقطع اتصالك لحظياً. ' +
				      'يُفضّل تنفيذه وأنت متصل بكابل. لن يُطبَّق أي تغيير قبل الخطوة التالية.'
			})
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
