'use strict';
'require view';
'require ui';
'require smartlink.data as data';
'require smartlink.modes as modes';
'require smartlink.widgets as w';

/*
 * SMARTLink - الإعداد، الخطوة 2: الاتصال
 *
 * What this step asks depends on the mode chosen in the previous one:
 *
 *   router          how the WAN port gets its address
 *   access point    what address the device itself should answer on
 *   wisp/repeater   which wireless network to take the internet from
 *
 * The mode and the connection settings are applied together in one pass, so
 * the router never sits in a half-changed state - and so the person is warned
 * once, with the new address in hand, rather than twice.
 */

var STEPS = [ 'الترحيب', 'وضع التشغيل', 'الاتصال', 'الشبكة اللاسلكية', 'اكتمل' ];

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
		return Promise.all([ data.modeConfig(), data.overview() ]);
	},

	render: function(res) {
		var self = this,
		    cfg = res[0],
		    snap = res[1],
		    detected = modes.detect(cfg),
		    key = modes.recallChoice(detected),
		    mode = modes.byKey(key),
		    wanCfg = (cfg.network || {}).wan || {},
		    lan = snap.lan || {},
		    radios = snap.radios || [];

		this.uplink = null;

		var body, collect;

		/* ------------------------------------------------ router: WAN form */

		if (mode.connection === 'wan') {
			var proto = w.select({ id: 'w-proto', value: wanCfg.proto || 'dhcp', options: PROTOCOLS }),
			    user  = w.input({ id: 'w-user', value: wanCfg.username || '' }),
			    pass  = w.input({ id: 'w-pass', type: 'password', placeholder: 'اتركها فارغة للإبقاء على الحالية' }),
			    ip    = w.input({ id: 'w-ip', value: wanCfg.ipaddr || '' }),
			    mask  = w.input({ id: 'w-mask', value: wanCfg.netmask || '255.255.255.0' }),
			    gw    = w.input({ id: 'w-gw', value: wanCfg.gateway || '' });

			var pppoe = w.fields([
				w.field({ label: 'اسم المستخدم', control: user }),
				w.field({ label: 'كلمة المرور', control: pass })
			]);

			var fixedFields = w.fields([
				w.field({ label: 'عنوان IPv4', control: ip }),
				w.field({ label: 'قناع الشبكة', control: mask }),
				w.field({ label: 'البوابة', control: gw, wide: true })
			]);

			var syncProto = function() {
				pppoe.style.display = (proto.value === 'pppoe') ? '' : 'none';
				fixedFields.style.display = (proto.value === 'static') ? '' : 'none';
			};

			proto.addEventListener('change', syncProto);
			syncProto();

			body = w.card({
				title: 'الاتصال بمزوّد الخدمة',
				desc: 'اختر الطريقة التي يمنحك بها المزوّد الاتصال عبر منفذ WAN.',
				children: [
					w.fields([ w.field({ label: 'نوع الاتصال', control: proto, wide: true }) ], true),
					pppoe,
					fixedFields
				]
			});

			collect = function() {
				var v = proto.value,
				    values = { proto: v };

				if (v === 'pppoe') {
					if (!user.value.trim())
						return { error: 'اسم مستخدم PPPoE مطلوب.' };

					values.username = user.value.trim();

					if (pass.value)
						values.password = pass.value;
					else if (!wanCfg.password)
						return { error: 'كلمة مرور PPPoE مطلوبة.' };
				}
				else {
					values.username = '';
					values.password = '';
				}

				if (v === 'static') {
					if (!isIPv4(ip.value) || !isIPv4(mask.value) || !isIPv4(gw.value))
						return { error: 'تحقّق من العنوان والقناع والبوابة.' };

					values.ipaddr = ip.value.trim();
					values.netmask = mask.value.trim();
					values.gateway = gw.value.trim();
				}
				else {
					values.ipaddr = '';
					values.netmask = '';
					values.gateway = '';
				}

				return { edits: [ { config: 'network', section: 'wan', values: values } ], opts: {} };
			};
		}

		/* -------------------------- access point: the device's own address */

		else if (mode.connection === 'address') {
			var addressing = w.select({
				id: 'w-addr',
				value: 'static',
				options: [
					[ 'static', 'عيّن عنواناً ثابتاً (موصى به)' ],
					[ 'dhcp', 'احصل على عنوان من الراوتر الرئيسي تلقائياً' ]
				]
			});

			var apIp = w.input({ id: 'w-ap-ip', value: lan.ipaddr || '192.168.1.2' }),
			    apMask = w.input({ id: 'w-ap-mask', value: '255.255.255.0' }),
			    apGw = w.input({ id: 'w-ap-gw', value: '192.168.1.1' });

			var apStatic = w.fields([
				w.field({ label: 'عنوان الجهاز', control: apIp }),
				w.field({ label: 'قناع الشبكة', control: apMask }),
				w.field({ label: 'بوابة الراوتر الرئيسي', control: apGw, wide: true })
			]);

			var syncAp = function() {
				apStatic.style.display = (addressing.value === 'static') ? '' : 'none';
			};

			addressing.addEventListener('change', syncAp);
			syncAp();

			body = w.card({
				title: 'عنوان الجهاز',
				desc: 'في وضع نقطة الوصول لن يوزّع هذا الجهاز عناوين؛ يأخذ عنوانه من الراوتر الرئيسي أو تحدّده أنت.',
				children: [
					w.fields([ w.field({ label: 'طريقة العنونة', control: addressing, wide: true }) ], true),
					apStatic
				]
			});

			collect = function() {
				if (addressing.value === 'static' &&
				    (!isIPv4(apIp.value) || !isIPv4(apMask.value) || !isIPv4(apGw.value)))
					return { error: 'تحقّق من العنوان والقناع والبوابة.' };

				return {
					edits: [],
					opts: {
						addressing: addressing.value,
						ipaddr: apIp.value.trim(),
						netmask: apMask.value.trim(),
						gateway: apGw.value.trim()
					}
				};
			};
		}

		/* ------------------------------ wisp / repeater: pick an uplink */

		else {
			var radioSelect = w.select({
				id: 'w-radio',
				value: (radios[0] || {}).radio,
				options: radios.map(function(r) {
					return [ r.radio, '%s — %s غيغاهرتز'.format(r.radio, r.band) ];
				})
			});

			var uplinkKey = w.input({ id: 'w-uplink-key', type: 'password', placeholder: 'كلمة مرور الشبكة المختارة' }),
			    keyField = w.field({ label: 'كلمة مرور الشبكة', control: uplinkKey }),
			    scanList = E('div', { 'class': 'sl-scan' }, [
			        E('p', { 'class': 'sl-tile-hint' }, 'اضغط «ابحث عن الشبكات» لعرض ما حولك.')
			    ]);

			var scanBtn = w.button({ label: 'ابحث عن الشبكات', icon: 'refresh', variant: 'action' });

			scanBtn.addEventListener('click', function() {
				var radio = radios.filter(function(r) { return r.radio === radioSelect.value; })[0];

				if (!radio || !radio.ifname) {
					ui.addNotification(null, E('p', 'لا توجد واجهة لاسلكية يمكن المسح بها.'), 'warning');
					return;
				}

				scanBtn.disabled = true;
				scanList.textContent = '';
				scanList.appendChild(E('p', { 'class': 'spinning' }, 'جارٍ البحث…'));

				data.scan(radio.ifname).then(function(found) {
					scanBtn.disabled = false;
					scanList.textContent = '';

					if (!found.length) {
						scanList.appendChild(E('p', { 'class': 'sl-tile-hint' }, 'لم يُعثر على شبكات.'));
						return;
					}

					found.forEach(function(ap) {
						var pct = Math.round(100 * (ap.quality || 0) / (ap.qualityMax || 70)),
						    enc = modes.encryptionFor(ap);

						var row = E('button', { 'type': 'button', 'class': 'sl-scan-row' }, [
							E('div', {}, [
								E('div', { 'class': 'sl-scan-name' }, ap.ssid),
								E('div', { 'class': 'sl-scan-meta' },
									'قناة %s · %s'.format(ap.channel || '—', enc === 'none' ? 'مفتوحة' : enc.toUpperCase()))
							]),
							E('div', { 'class': 'sl-scan-signal' }, [
								E('div', {}, '%d%%'.format(pct)),
								E('div', { 'class': 'sl-scan-meta' }, '%d dBm'.format(ap.signal || 0))
							])
						]);

						row.addEventListener('click', function() {
							scanList.querySelectorAll('.sl-scan-row').forEach(function(n) {
								n.classList.remove('is-selected');
							});

							row.classList.add('is-selected');
							self.uplink = { radio: radioSelect.value, ssid: ap.ssid, encryption: enc };
							keyField.style.display = (enc === 'none') ? 'none' : '';
						});

						scanList.appendChild(row);
					});
				}).catch(function(err) {
					scanBtn.disabled = false;
					scanList.textContent = '';
					scanList.appendChild(E('p', { 'class': 'sl-field-error' }, 'تعذّر البحث: ' + err));
				});
			});

			body = w.card({
				title: 'الشبكة المصدر',
				desc: 'اختر الشبكة اللاسلكية التي سيأخذ منها الجهاز الإنترنت.',
				children: [
					w.fields([
						w.field({ label: 'الراديو المستخدم للاتصال', control: radioSelect }),
						keyField
					]),
					E('div', { 'style': 'margin-block:14px' }, [ scanBtn ]),
					scanList
				]
			});

			collect = function() {
				if (!self.uplink)
					return { error: 'اختر الشبكة المصدر من نتائج البحث أولاً.' };

				if (self.uplink.encryption !== 'none' && !uplinkKey.value)
					return { error: 'كلمة مرور الشبكة المصدر مطلوبة.' };

				return {
					edits: [],
					opts: {
						radio: self.uplink.radio,
						ssid: self.uplink.ssid,
						encryption: self.uplink.encryption,
						key: uplinkKey.value
					}
				};
			};
		}

		/* ------------------------------------------------------------ apply */

		var nextBtn = w.button({ label: 'التالي', icon: 'next', variant: 'apply' });

		nextBtn.addEventListener('click', function() {
			var got = collect();

			if (got.error) {
				ui.addNotification(null, E('p', got.error), 'warning');
				return;
			}

			var plan = modes.plan(key, cfg, got.opts),
			    changingMode = (key !== detected);

			plan.edits = plan.edits.concat(got.edits);

			var ROLLBACK = 90;

			/*
			 * Applied behind netifd's rollback timer. We only tell the router
			 * to keep the change once it has answered us again on whatever
			 * address it now has; if it cannot, the timer expires and the
			 * router restores itself.
			 */
			var proceed = function() {
				ui.showModal('جارٍ التطبيق…', [
					E('p', { 'class': 'spinning' }, 'يتم تطبيق الإعدادات')
				]);

				modes.apply(plan, cfg, ROLLBACK).then(function() {
					if (!changingMode) {
						return data.confirmApply().then(function() {
							window.location.href = L.url('smartlink/setup/step2');
						});
					}

					return waitForRouter(plan.address);
				}).catch(function(err) {
					ui.hideModal();
					ui.addNotification(null, E('p', 'تعذّر الحفظ: ' + err), 'error');
				});
			};

			/* Poll until the router answers, then confirm. */
			function waitForRouter(address) {
				var deadline = Date.now() + (ROLLBACK - 15) * 1000,
				    base = address ? ('http://' + address + '/cgi-bin/luci') : L.env.base_url;

				var countdown = E('p', {}, '');

				ui.showModal('يتم التحقق من الاتصال…', [
					E('p', { 'class': 'spinning' }, 'ننتظر ردّ الراوتر بعد تغيير الوضع'),
					countdown,
					E('p', { 'style': 'color:var(--sl-on-warn-soft);background:var(--sl-warn-soft);padding:10px 14px;border-radius:8px' },
						'إن لم يردّ خلال المهلة سيتراجع الراوتر عن التغيير تلقائياً ويعود كما كان. لا تطفئ الجهاز.')
				]);

				return new Promise(function(resolve) {
					var tick = function() {
						var left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
						countdown.textContent = 'المتبقّي: %d ثانية'.format(left);

						if (left <= 0) {
							ui.showModal('تراجع الراوتر عن التغيير', [
								E('p', 'لم يردّ الراوتر بعد تغيير الوضع، فأعاد إعداداته السابقة تلقائياً.'),
								E('p', 'جرّب وأنت موصول بكابل في أحد منافذ LAN، أو اختر عنواناً ثابتاً تعرفه.'),
								E('div', { 'class': 'right' }, [
									E('a', { 'class': 'btn cbi-button-action', 'href': L.url('smartlink/setup/mode') }, 'رجوع')
								])
							]);
							resolve();
							return;
						}

						fetch(base + '/admin/ubus', { method: 'HEAD', cache: 'no-store' })
							.then(function() {
								return data.confirmApply();
							})
							.then(function() {
								ui.showModal('تم التطبيق', [
									E('p', 'الراوتر يردّ على العنوان الجديد وتم تثبيت التغيير.'),
									E('div', { 'class': 'right' }, [
										E('a', {
											'class': 'btn cbi-button-action',
											'href': address ? ('http://' + address + '/cgi-bin/luci/smartlink/setup/step2')
											                : L.url('smartlink/setup/step2')
										}, 'متابعة')
									])
								]);
								resolve();
							})
							.catch(function() { setTimeout(tick, 3000); });
					};

					setTimeout(tick, 6000);
				});
			}

			/* Only a mode change can move the interface out from under us. */
			if (!changingMode) {
				proceed();
				return;
			}

			ui.showModal('تأكيد تغيير الوضع', [
				E('p', 'سيتحوّل الجهاز إلى وضع «%s».'.format(mode.title)),
				E('p', plan.address
					? 'ستصل للواجهة بعدها على %s.'.format(plan.address)
					: 'سيأخذ الجهاز عنوانه من الشبكة، وقد تحتاج لمعرفة العنوان الجديد من الراوتر الرئيسي.'),
				E('p', { 'style': 'color:var(--sl-on-warn-soft);background:var(--sl-warn-soft);padding:10px 14px;border-radius:8px' },
					'إن تعذّر الوصول للواجهة بعد التبديل، أعِد الجهاز لضبط المصنع بالضغط على زر Reset لعشر ثوانٍ.'),
				E('div', { 'class': 'right' }, [
					E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.hideModal }, 'إلغاء'),
					' ',
					E('button', { 'class': 'btn cbi-button-negative important', 'click': proceed }, 'نفّذ')
				])
			]);
		});

		return w.page([
			w.steps(STEPS, 2),

			w.head({
				icon: mode.icon,
				accent: mode.accent,
				title: 'الاتصال — وضع «%s»'.format(mode.title),
				subtitle: mode.desc
			}),

			w.grid(3, [
				E('div', { 'class': 'sl-span-2', 'style': 'display:grid;gap:var(--sl-gutter)' }, [
					body,
					w.card({ children: [ w.actions([
						w.button({ label: 'رجوع', icon: 'back', href: L.url('smartlink/setup/mode') }),
						E('span', { 'class': 'sl-actions-end' }, [ nextBtn ])
					]) ] })
				]),

				w.card({
					title: 'الحالة الحالية',
					children: [
						w.kv([
							[ 'الوضع المكتشف', modes.byKey(detected).title ],
							[ 'الوضع المختار', mode.title, (key === detected) ? null : 'wireless' ],
							[ 'عنوان الجهاز', lan.ipaddr || '—' ],
							[ 'الإنترنت', (snap.wan || {}).up ? 'متصل' : 'غير متصل', (snap.wan || {}).up ? 'lan' : 'error' ]
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
