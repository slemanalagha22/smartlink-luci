'use strict';
'require view';
'require ui';
'require smartlink.data as data';
'require smartlink.widgets as w';

/*
 * SMARTLink - الشبكة المحلية
 *
 * Address and DHCP pool for the LAN bridge. Changing the LAN address moves the
 * interface this page is served from, so the save path says so plainly instead
 * of appearing to hang when the browser loses the old address.
 */

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
			data.call('uci', 'get', { config: 'network', section: 'lan' }),
			data.call('uci', 'get', { config: 'dhcp', section: 'lan' })
		]);
	},

	render: function(res) {
		var snap = res[0],
		    net = (res[1] && res[1].values) || {},
		    dhcp = (res[2] && res[2].values) || {},
		    lan = snap.lan || {};

		var ipaddr  = w.input({ id: 'sl-lan-ip', value: net.ipaddr || lan.ipaddr || '192.168.1.1' }),
		    netmask = w.input({ id: 'sl-lan-mask', value: net.netmask || '255.255.255.0' }),
		    dhcpOn  = w.toggle({ id: 'sl-dhcp-on', checked: dhcp.ignore !== '1', label: 'تشغيل خادم DHCP' }),
		    start   = w.input({ id: 'sl-dhcp-start', type: 'number', value: dhcp.start || '100' }),
		    limit   = w.input({ id: 'sl-dhcp-limit', type: 'number', value: dhcp.limit || '150' }),
		    lease   = w.input({ id: 'sl-dhcp-lease', value: dhcp.leasetime || '12h' });

		var poolFields = w.fields([
			w.field({ label: 'أول عنوان في المدى', control: start, hint: 'الجزء الأخير من العنوان، مثلاً 100 يعني ‎.100' }),
			w.field({ label: 'عدد العناوين', control: limit }),
			w.field({ label: 'مدة الحجز', control: lease, hint: 'مثل 12h أو 30m أو infinite.' })
		]);

		function syncPool() {
			poolFields.style.display = dhcpOn.querySelector('input').checked ? '' : 'none';
		}

		dhcpOn.querySelector('input').addEventListener('change', syncPool);
		syncPool();

		var leaseCount = (snap.clients || []).filter(function(c) { return c.ip; }).length;

		var saveBtn = w.button({ label: 'حفظ التغييرات', icon: 'save', variant: 'apply' });

		saveBtn.addEventListener('click', function() {
			var newIp = ipaddr.value.trim(),
			    newMask = netmask.value.trim();

			if (!isIPv4(newIp) || !isIPv4(newMask)) {
				ui.addNotification(null, E('p', 'العنوان أو قناع الشبكة غير صالح.'), 'warning');
				return;
			}

			var on = dhcpOn.querySelector('input').checked,
			    moved = (newIp !== (net.ipaddr || lan.ipaddr));

			var edits = [
				{ config: 'network', section: 'lan', values: { ipaddr: newIp, netmask: newMask } },
				{ config: 'dhcp', section: 'lan', values: on
					? { ignore: '0', start: start.value.trim(), limit: limit.value.trim(), leasetime: lease.value.trim() }
					: { ignore: '1' } }
			];

			saveBtn.disabled = true;
			ui.showModal('جارٍ الحفظ…', [ E('p', { 'class': 'spinning' }, 'يتم تطبيق إعدادات الشبكة المحلية') ]);

			data.save(edits, { reloadNetwork: true }).then(function() {
				ui.hideModal();
				saveBtn.disabled = false;

				if (moved) {
					ui.showModal('تغيّر عنوان الراوتر', [
						E('p', 'صار الراوتر على العنوان %s. افتح الواجهة على العنوان الجديد؛ قد تحتاج لتجديد عنوان جهازك أولاً.'.format(newIp)),
						E('div', { 'class': 'right' }, [
							E('a', { 'class': 'btn cbi-button-action', 'href': 'http://' + newIp + '/cgi-bin/luci/smartlink/home' }, 'انتقل الآن')
						])
					]);
				}
				else {
					ui.addNotification(null, E('p', 'حُفظت إعدادات الشبكة المحلية.'), 'info');
				}
			}).catch(function(err) {
				ui.hideModal();
				saveBtn.disabled = false;
				ui.addNotification(null, E('p', 'تعذّر الحفظ: ' + err), 'error');
			});
		});

		return w.page([
			w.head({
				icon: 'lan',
				accent: 'lan',
				title: 'إعدادات الشبكة المحلية',
				subtitle: 'عنوان الراوتر داخل شبكتك ونطاق العناوين الذي يوزّعه على الأجهزة.'
			}),
			w.grid(3, [
				E('div', { 'class': 'sl-span-2', 'style': 'display:grid;gap:var(--sl-gutter)' }, [
					w.card({
						title: 'عنوان الراوتر',
						desc: 'هذا هو العنوان الذي تفتح به هذه الواجهة.',
						children: [
							w.fields([
								w.field({ label: 'عنوان IPv4', control: ipaddr }),
								w.field({ label: 'قناع الشبكة', control: netmask })
							])
						]
					}),
					w.card({
						title: 'خادم DHCP',
						desc: 'توزيع العناوين تلقائياً على الأجهزة المتصلة.',
						children: [
							w.fields([ w.field({ label: 'الحالة', control: dhcpOn, wide: true }) ], true),
							poolFields
						]
					}),
					w.card({ children: [ w.actions([ saveBtn ]) ] })
				]),
				E('div', { 'style': 'display:grid;gap:var(--sl-gutter);align-content:start' }, [
					w.card({
						title: 'الحالة',
						children: [
							w.kv([
								[ 'الواجهة', lan.device || 'br-lan' ],
								[ 'العنوان الحالي', lan.ipaddr || '—' ],
								[ 'أجهزة لها عنوان', String(leaseCount) ]
							])
						]
					}),
					w.note({
						kind: 'info',
						title: 'قبل تغيير العنوان',
						text: 'تغيير عنوان الراوتر يقطع الجلسة الحالية. ستحتاج لفتح الواجهة على العنوان الجديد بعد الحفظ.'
					})
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
