'use strict';
'require view';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - التطبيق
 *
 * Application-level features. Each entry is probed rather than assumed: a
 * feature whose uci config is absent is shown as not installed instead of
 * linking to a page that would 404.
 */

var FEATURES = [
	{ key: 'forwards', config: 'firewall', icon: 'link',     accent: 'primary',  title: 'توجيه المنافذ',
	  hint: 'فتح منفذ لجهاز داخلي', url: 'admin/network/firewall/forwards' },
	{ key: 'firewall', config: 'firewall', icon: 'shield',   accent: 'internet', title: 'جدار الحماية',
	  hint: 'قواعد الحماية والمناطق', url: 'admin/network/firewall' },
	{ key: 'hosts',    config: 'dhcp',     icon: 'guest',    icon2: true, accent: 'devices', title: 'حجز العناوين',
	  hint: 'ربط جهاز بعنوان ثابت', url: 'admin/network/dhcp' },
	{ key: 'sqm',      config: 'sqm',      icon: 'speed',    accent: 'wireless', title: 'إدارة النطاق',
	  hint: 'تحديد سرعة الاتصال (SQM)', url: 'admin/network/sqm' },
	{ key: 'ddns',     config: 'ddns',     icon: 'internet', accent: 'lan',      title: 'DNS الديناميكي',
	  hint: 'اسم ثابت لعنوان متغيّر', url: 'admin/services/ddns' },
	{ key: 'upnp',     config: 'upnpd',    icon: 'devices',  accent: 'gold',     title: 'UPnP',
	  hint: 'فتح المنافذ تلقائياً للتطبيقات', url: 'admin/services/upnp' }
];

return view.extend({
	load: function() {
		/* One probe per feature config; a missing config answers with null. */
		return Promise.all(FEATURES.map(function(f) {
			return data.call('uci', 'get', { config: f.config }).catch(function() { return null; });
		}));
	},

	render: function(probes) {
		var tiles = FEATURES.map(function(f, i) {
			var available = !!probes[i];

			return w.tile({
				accent: available ? f.accent : undefined,
				icon: f.icon,
				title: f.title,
				value: available ? 'متاح' : 'غير مثبّت',
				hint: available ? f.hint : 'الحزمة غير موجودة على هذا الجهاز',
				href: available ? L.url(f.url) : null
			});
		});

		var installed = probes.filter(Boolean).length;

		return w.page([
			w.head({
				icon: 'settings',
				accent: 'primary',
				title: 'التطبيقات والخدمات',
				subtitle: 'الوظائف الإضافية المتاحة على هذا الجهاز.'
			}),

			w.grid(3, [
				w.stat({ accent: 'primary',  icon: 'check',    label: 'خدمات متاحة',  value: String(installed) }),
				w.stat({ accent: 'devices',  icon: 'settings', label: 'إجمالي المتحقق منها', value: String(FEATURES.length) }),
				w.stat({ accent: 'gold',     icon: 'download', label: 'إدارة الحزم',  value: 'opkg' })
			]),

			w.card({
				title: 'الخدمات',
				desc: 'الخدمات غير المثبّتة يمكن إضافتها من مدير الحزم.',
				children: [ w.grid(3, tiles) ]
			}),

			w.note({
				kind: 'info',
				title: 'تثبيت خدمة جديدة',
				text: 'افتح مدير الحزم من صفحة النظام، حدّث القائمة، ثم ثبّت الحزمة المطلوبة. ستظهر هنا تلقائياً بعد التثبيت.'
			}),

			w.card({
				children: [
					w.actions([
						w.button({ label: 'فتح مدير الحزم', icon: 'download', variant: 'action', href: L.url('admin/system/opkg') }),
						w.button({ label: 'خدمات النظام', icon: 'settings', href: L.url('admin/system/startup') })
					])
				]
			})
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
