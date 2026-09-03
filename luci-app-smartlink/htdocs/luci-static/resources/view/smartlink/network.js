'use strict';
'require view';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - نظرة عامة على الشبكة
 *
 * The landing page for the network section: a live summary and shortcuts to
 * the pages that actually change something.
 */

return view.extend({
	load: function() {
		return data.overview();
	},

	render: function(snap) {
		var wan = snap.wan || {},
		    lan = snap.lan || {},
		    radios = snap.radios || [],
		    clients = snap.clients || [],
		    active = radios.filter(function(r) { return r.up; });

		var tiles = [
			w.tile({
				accent: 'internet', icon: 'internet', title: 'الإنترنت',
				value: wan.up ? 'متصل' : 'غير متصل',
				hint: wan.up ? (wan.ipaddr || String(wan.proto || '').toUpperCase()) : 'إعداد الاتصال بالمزوّد',
				href: L.url('smartlink/network/internet')
			}),
			w.tile({
				accent: 'wireless', icon: 'wifi', title: 'الشبكة اللاسلكية',
				value: active.length ? 'نشط' : 'متوقف',
				hint: active.map(function(r) { return r.ssid; }).filter(Boolean).join(' · ') || 'تفعيل البث وتغيير الاسم',
				href: L.url('smartlink/network/wireless')
			}),
			w.tile({
				accent: 'lan', icon: 'lan', title: 'الشبكة المحلية',
				value: lan.ipaddr || '—',
				hint: 'عنوان الراوتر ونطاق DHCP',
				href: L.url('smartlink/network/lan')
			}),
			w.tile({
				accent: 'devices', icon: 'users', title: 'الأجهزة المتصلة',
				value: String(clients.length),
				hint: 'عرض الأجهزة والتحكم بوصولها',
				href: L.url('smartlink/network/devices')
			})
		];

		var advanced = [
			[ 'shield', 'جدار الحماية', 'قواعد الحماية والمناطق', L.url('admin/network/firewall') ],
			[ 'link',   'توجيه المنافذ', 'فتح منفذ لجهاز داخلي', L.url('admin/network/firewall/forwards') ],
			[ 'lan',    'الواجهات',      'إعدادات الشبكة المتقدمة', L.url('admin/network/network') ],
			[ 'guest',  'DHCP و DNS',    'الحجوزات وأسماء المضيفين', L.url('admin/network/dhcp') ]
		];

		return w.page([
			w.head({
				icon: 'lan',
				accent: 'primary',
				title: 'إعدادات الشبكة',
				subtitle: 'إدارة وظائف الشبكة وتخصيص تجربة الاتصال الخاصة بك.'
			}),
			w.grid(4, tiles),
			w.card({
				title: 'إعدادات متقدمة',
				desc: 'صفحات LuCI الأصلية لمن يحتاج تحكماً أدق.',
				children: [
					w.grid(4, advanced.map(function(a) {
						return w.tile({ accent: 'primary', icon: a[0], title: a[1], value: '', hint: a[2], href: a[3] });
					}))
				]
			})
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
