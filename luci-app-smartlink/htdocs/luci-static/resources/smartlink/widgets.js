'use strict';
'require baseclass';

/*
 * SMARTLink component builders.
 *
 * Every page is assembled from these rather than from imported markup, so the
 * DOM a page produces and the CSS the theme ships are designed against each
 * other. Class names are semantic (.sl-tile-value, .sl-stat-value), which is
 * what lets a page update a value without guessing at document structure.
 */

/* Material Symbols outlines, viewBox "0 -960 960 960". */
var ICONS = {
	internet:  'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-62q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-78-12q-18-33-31.5-68.5T348-300H204q35 61 88 100t110 54Zm156 0q57-15 110-54t88-100H612q-9 42-22.5 77.5T558-154ZM178-360h158q-3-20-4.5-39.5T330-440q0-21 1.5-40.5T336-520H178q-5 20-7.5 39.5T168-440q0 21 2.5 40.5T178-360Zm220 0h164q3-20 4.5-39.5T568-440q0-21-1.5-40.5T562-520H398q-3 20-4.5 39.5T392-440q0 21 1.5 40.5T398-360Zm226 0h158q5-20 7.5-39.5T792-440q0-21-2.5-40.5T782-520H624q3 20 4.5 39.5T630-440q0 21-1.5 40.5T624-360Zm-12-220h144q-35-61-88-100t-110-54q18 33 31.5 68.5T612-580Zm-208 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h144q9-42 22.5-77.5T402-806q-57 15-110 54t-88 100Z',
	router:    'M180-120q-24 0-42-18t-18-42v-204q0-24 18-42t42-18h436v-176h60v176h104q24 0 42 18t18 42v204q0 24-18 42t-42 18H180Zm132-132q12-12 12-30t-12-30q-12-12-30-12t-30 12q-12 12-12 30t12 30q12 12 30 12t30-12Zm148 0q12-12 12-30t-12-30q-12-12-30-12t-30 12q-12 12-12 30t12 30q12 12 30 12t30-12Zm148 0q12-12 12-30t-12-30q-12-12-30-12t-30 12q-12 12-12 30t12 30q12 12 30 12t30-12ZM566-667l-41-41q24-24 54-38t67-14q36 0 66 14t54 38l-41 41q-14-14-35-23.5t-44-9.5q-23 0-45 9.5T566-667Zm-85-85-44-44q33-33 88-58.5T646-880q66 0 121 25.5t88 58.5l-44 44q-26-29-68.5-48.5T646-820q-54 0-96.5 19.5T481-752Z',
	devices:   'M80-160v-60h421v60H80Zm100-120q-24 0-42-18t-18-42v-400q0-24 18-42t42-18h600q24 0 42 18t18 42H180v400h321v60H180Zm426 120q-18 0-31.5-13.5T561-205v-430q0-18 13.5-31.5T606-680h229q18 0 31.5 13.5T880-635v430q0 18-13.5 31.5T835-160H606Zm15-60h199v-400H621v400Z',
	wifi:      'M480-120q-27 0-46.5-19.5T414-186q0-27 19.5-46.5T480-252q27 0 46.5 19.5T546-186q0 27-19.5 46.5T480-120ZM254-346l-84-86q59-59 138-93.5T480-560q93 0 172 35t138 94l-84 85q-44-44-102-69.5T480-441q-66 0-124 25.5T254-346ZM84-516 0-602q92-94 215-146t265-52q142 0 265 52t215 146l-84 86q-77-77-178-120.5T480-680q-117 0-218 43.5T84-516Z',
	lan:       'M320-240 80-480l240-240 57 57-184 183 184 183-57 57Zm320 0-57-57 184-183-184-183 57-57 240 240-240 240Z',
	users:     'M38-160v-94q0-35 18-63.5t50-42.5q73-32 131.5-46T358-420q62 0 120 14t131 46q32 14 50.5 42.5T678-254v94H38Zm700 0v-94q0-63-32-103.5T622-423q69 8 130 23.5t99 35.5q33 19 52 47t19 63v94H738ZM358-482q-66 0-108-42t-42-108q0-66 42-108t108-42q66 0 108 42t42 108q0 66-42 108t-108 42Z',
	settings:  'm388-80-20-126q-19-7-40-19t-37-25l-118 54-93-164 108-79q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521L80-600l93-164 118 54q16-13 37-25t40-18l20-127h184l20 126q19 7 40.5 18.5T669-710l118-54 93 164-108 77q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l108 78-93 164-118-54q-16 13-36.5 25.5T592-206L572-80H388Zm92-270q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Z',
	tools:     'M624-528q29 0 50.5-21.5T696-600q0-29-21.5-50.5T624-672q-29 0-50.5 21.5T552-600q0 29 21.5 50.5T624-528Zm-360 0q29 0 50.5-21.5T336-600q0-29-21.5-50.5T264-672q-29 0-50.5 21.5T192-600q0 29 21.5 50.5T264-528ZM444-80q-92 0-173.5-35T128-211q-61-61-96-142.5T-3-527h81q0 75 28.5 140.5t77 114q48.5 48.5 114 77T438-167v87Zm240-40-11-53q-14-5-27.5-12.5T620-202l-52 17-32-56 40-36q-2-14-2-28t2-28l-40-36 32-56 52 17q12-9 25.5-16.5T673-437l11-53h64l11 53q14 5 27.5 12.5T812-408l52-17 32 56-40 36q2 14 2 28t-2 28l40 36-32 56-52-17q-12 9-25.5 16.5T759-173l-11 53h-64Zm32-104q30 0 51-21t21-51q0-30-21-51t-51-21q-30 0-51 21t-21 51q0 30 21 51t51 21ZM444-320q-83 0-141.5-58.5T244-520q0-83 58.5-141.5T444-720q83 0 141.5 58.5T644-520h-80q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35v80Z',
	shield:    'M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-202l-240-90-240 90v202q0 121 68 220t172 132Z',
	speed:     'M418-340q24 24 62 23.5t56-27.5l224-336-336 224q-27 18-28.5 55t22.5 61Zm62-460q59 0 113.5 16.5T696-734l-74 42q-33-18-69-28t-73-10q-143 0-241.5 98.5T140-390q0 45 12 88.5t36 81.5h584q26-38 37-80.5t11-89.5q0-37-9.5-72T782-526l42-74q30 47 47 101t18 111q1 57-13 109t-41 99q-11 18-30 29t-40 11H188q-21 0-40-11t-30-29q-26-45-40-95.5T63-390q1-87 34-163t90-132.5Q244-742 319.5-771T480-800Z',
	refresh:   'M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z',
	save:      'M840-680v480q0 33-23.5 56.5T760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h480l160 160ZM760-646 646-760H200v560h560v-446ZM480-240q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35ZM240-560h360v-160H240v160Z',
	next:      'M647-440H160v-80h487L423-744l57-56 320 320-320 320-57-56 224-224Z',
	back:      'M313-440l224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z',
	check:     'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z',
	done:      'm424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z',
	warning:   'M40-120l440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Z',
	info:      'M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z',
	key:       'M280-400q-33 0-56.5-23.5T200-480q0-33 23.5-56.5T280-560q33 0 56.5 23.5T360-480q0 33-23.5 56.5T280-400Zm0 160q-100 0-170-70T40-480q0-100 70-170t170-70q67 0 121.5 33t86.5 87h282l120 120-180 180-80-60-80 60-85-60h-57q-32 54-86.5 87T280-240Z',
	laptop:    'M40-160v-80h880v80H40Zm120-120q-33 0-56.5-23.5T80-360v-400q0-33 23.5-56.5T160-840h640q33 0 56.5 23.5T880-760v400q0 33-23.5 56.5T800-280H160Zm0-80h640v-400H160v400Z',
	phone:     'M280-40q-33 0-56.5-23.5T200-120v-720q0-33 23.5-56.5T280-920h400q33 0 56.5 23.5T760-840v720q0 33-23.5 56.5T680-40H280Zm0-120v40h400v-40H280Zm0-80h400v-480H280v480Zm0-560h400v-40H280v40Z',
	monitor:   'M320-120v-80h80v-80H160q-33 0-56.5-23.5T80-360v-400q0-33 23.5-56.5T160-840h640q33 0 56.5 23.5T880-760v400q0 33-23.5 56.5T800-280H560v80h80v80H320ZM160-360h640v-400H160v400Z',
	download:  'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
	guest:     'M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Z',
	link:      'M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z',
	restart:   'M451-122q-123-10-207-101t-84-216q0-77 35.5-145T295-695l43 43q-56 33-87 90.5T220-439q0 100 66 173t165 84v60Zm60 0v-60q100-12 165-84.5T741-439q0-109-75.5-184.5T481-699h-20l60 60-43 43-133-133 133-133 43 43-60 60h20q134 0 227 93.5T801-439q0 125-83.5 216T511-122Z',
	upgrade:   'M440-160v-326L336-382l-56-58 200-200 200 200-56 58-104-104v326h-80ZM160-680v-40q0-33 23.5-56.5T240-800h480q33 0 56.5 23.5T800-720v40h-80v-40H240v40h-80Z',
	logs:      'M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520Z',
	port:      'M160-160q-33 0-56.5-23.5T80-240v-240q0-33 23.5-56.5T160-560h80v-120q0-33 23.5-56.5T320-760h320q33 0 56.5 23.5T720-680v120h80q33 0 56.5 23.5T880-480v240q0 33-23.5 56.5T800-160H160Zm140-400h360v-120H300v120Zm-140 80v240h640v-240H160Zm120 160h80v-80h-80v80Zm140 0h80v-80h-80v80Zm140 0h80v-80h-80v80Z',
	bridge:    'M120-160v-80h180v-200q0-83 58.5-141.5T500-640h60v-160h280v240H560v-40h-60q-50 0-85 35t-35 85v200h180v80H120Z',
	logout:    'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Zm440-160-56-58 102-102H360v-80h326L584-622l56-58 200 200-200 200Z',
	repeater:  'M480-80q-17 0-28.5-11.5T440-120v-320q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440v320q0 17-11.5 28.5T480-80ZM254-546l-84-86q59-59 138-93.5T480-760q93 0 172 35t138 94l-84 85q-44-44-102-69.5T480-641q-66 0-124 25.5T254-546ZM84-716 0-802q92-94 215-146t265-52q142 0 265 52t215 146l-84 86q-77-77-178-120.5T480-880q-117 0-218 43.5T84-716Zm396 396q-33 0-56.5-23.5T400-400q0-33 23.5-56.5T480-480q33 0 56.5 23.5T560-400q0 33-23.5 56.5T480-320Z'
};

/*
 * LuCI's E() builds nodes with document.createElement, which puts <svg> in the
 * HTML namespace where it does not render. Writing the markup into a wrapper
 * lets the parser place it in the SVG namespace instead; the wrapper is
 * display:contents so it never affects layout.
 */
function svg(name) {
	var path = ICONS[name] || ICONS.info,
	    holder = E('span', { 'class': 'sl-ico', 'style': 'display:contents' });

	holder.innerHTML = '<svg viewBox="0 -960 960 960" aria-hidden="true" ' +
	                   'xmlns="http://www.w3.org/2000/svg"><path d="' + path + '"/></svg>';

	return holder;
}

function cls() {
	return Array.prototype.filter.call(arguments, Boolean).join(' ');
}

return baseclass.extend({
	icon: svg,

	page: function(children) {
		return E('div', { 'class': 'sl-page' }, children);
	},

	head: function(o) {
		var left = [];

		if (o.icon)
			left.push(E('div', { 'class': cls('sl-head-icon', o.accent && 'sl-accent-' + o.accent) }, [ svg(o.icon) ]));

		left.push(E('div', { 'class': 'sl-head-text' }, [
			E('h1', {}, o.title),
			o.subtitle ? E('p', {}, o.subtitle) : ''
		]));

		if (o.actions && o.actions.length)
			left.push(E('div', { 'class': 'sl-head-actions' }, o.actions));

		return E('div', { 'class': 'sl-head' }, left);
	},

	card: function(o) {
		var kids = [];

		if (o.title) kids.push(E('h2', {}, o.title));
		if (o.desc)  kids.push(E('p', {}, o.desc));

		return E('div', { 'class': cls('sl-card', o.class) },
			kids.concat([].concat(o.children || [])));
	},

	grid: function(cols, children) {
		return E('div', {
			'class': 'sl-grid',
			'style': cols ? '--sl-cols:' + cols : null
		}, children);
	},

	tile: function(o) {
		var attrs = { 'class': cls('sl-tile', o.accent && 'sl-accent-' + o.accent) },
		    node;

		if (o.href) {
			attrs.href = o.href;
			node = E('a', attrs, []);
		}
		else {
			node = E('div', attrs, []);
		}

		node.appendChild(E('div', { 'class': 'sl-tile-icon' }, [ svg(o.icon) ]));
		node.appendChild(E('div', { 'class': 'sl-tile-title' }, o.title));
		node.appendChild(E('div', { 'class': 'sl-tile-value' }, o.value !== undefined ? o.value : '—'));
		node.appendChild(E('div', { 'class': 'sl-tile-hint' }, o.hint || ''));

		return node;
	},

	stat: function(o) {
		return E('div', { 'class': cls('sl-stat', o.accent && 'sl-accent-' + o.accent) }, [
			E('div', { 'class': 'sl-stat-icon' }, [ svg(o.icon) ]),
			E('div', {}, [
				E('div', { 'class': 'sl-stat-label' }, o.label),
				E('div', { 'class': 'sl-stat-value' }, o.value !== undefined ? o.value : '—')
			])
		]);
	},

	/*
	 * The physical ports, drawn as the row of sockets they are on the box.
	 * A port with a carrier shows its negotiated speed; one without shows
	 * nothing rather than a zero, because "no link" is not "0 Mbit/s".
	 */
	ports: function(list) {
		return E('div', { 'class': 'sl-ports' }, list.map(function(p) {
			var label = (p.role === 'wan') ? 'WAN' : ('LAN ' + (p.index || ''));

			return E('div', {
				'class': cls('sl-port', p.up ? 'is-up' : 'is-down', p.role === 'wan' && 'is-wan'),
				'title': p.mac ? (p.name + ' · ' + p.mac) : p.name
			}, [
				E('div', { 'class': 'sl-port-jack' }, [ svg('port') ]),
				E('div', { 'class': 'sl-port-name' }, label.trim()),
				E('div', { 'class': 'sl-port-speed' },
					p.up ? (p.speed ? (p.speed + 'M') : 'متصل') : 'فارغ')
			]);
		}));
	},

	flowNode: function(o) {
		return E('div', { 'class': cls('sl-flow-node', o.accent && 'sl-accent-' + o.accent, o.down && 'is-down') }, [
			E('div', { 'class': 'sl-flow-wrap' }, [
				E('div', { 'class': 'sl-flow-icon' }, [ svg(o.icon) ]),
				o.badge !== undefined ? E('span', { 'class': 'sl-flow-badge' }, o.badge) : ''
			]),
			E('div', { 'class': 'sl-flow-label' }, o.label)
		]);
	},

	flow: function(nodes) {
		return E('div', { 'class': 'sl-flow' }, nodes);
	},

	chip: function(text, accent) {
		return E('span', { 'class': cls('sl-chip', accent && 'sl-accent-' + accent) }, text);
	},

	table: function(columns, rows) {
		return E('div', { 'class': 'sl-table-wrap' }, [
			E('table', { 'class': 'sl-table' }, [
				E('thead', {}, [
					E('tr', {}, columns.map(function(c) {
						return E('th', { 'class': c.actions ? 'sl-cell-actions' : null }, c.title);
					}))
				]),
				E('tbody', {}, rows)
			])
		]);
	},

	emptyRow: function(colspan, text) {
		return E('tr', {}, [ E('td', { 'colspan': colspan, 'class': 'sl-empty' }, text) ]);
	},

	field: function(o) {
		var kids = [];

		if (o.label)
			kids.push(E('label', { 'for': o.id }, o.label));

		kids.push(o.control);

		if (o.hint)
			kids.push(E('div', { 'class': 'sl-field-hint' }, o.hint));

		return E('div', { 'class': cls('sl-field', o.wide && 'sl-field-wide') }, kids);
	},

	fields: function(children, single) {
		return E('div', { 'class': cls('sl-fields', single && 'sl-fields-1') }, children);
	},

	input: function(o) {
		return E('input', {
			'type': o.type || 'text',
			'id': o.id,
			'value': o.value !== undefined && o.value !== null ? o.value : '',
			'placeholder': o.placeholder || null,
			'autocomplete': o.autocomplete || 'off',
			'spellcheck': 'false'
		});
	},

	select: function(o) {
		return E('select', { 'id': o.id }, (o.options || []).map(function(opt) {
			return E('option', {
				'value': opt[0],
				'selected': String(opt[0]) === String(o.value) ? '' : null
			}, opt[1]);
		}));
	},

	toggle: function(o) {
		return E('label', { 'class': 'sl-switch' }, [
			E('input', { 'type': 'checkbox', 'id': o.id, 'checked': o.checked ? '' : null }),
			E('span', { 'class': 'sl-switch-track' }),
			o.label ? E('span', {}, o.label) : ''
		]);
	},

	note: function(o) {
		var kids = [];

		if (o.title) kids.push(E('h3', {}, o.title));

		if (Array.isArray(o.items))
			kids.push(E('ul', {}, o.items.map(function(i) { return E('li', {}, i); })));
		else if (o.text)
			kids.push(E('p', {}, o.text));

		return E('div', { 'class': cls('sl-note', o.kind && 'sl-note-' + o.kind) }, kids);
	},

	bar: function(percent, accent) {
		return E('div', { 'class': cls('sl-bar', accent && 'sl-accent-' + accent) }, [
			E('span', { 'style': 'width:' + Math.max(0, Math.min(100, percent || 0)) + '%' })
		]);
	},

	chart: function(count) {
		var bars = [];

		for (var i = 0; i < count; i++)
			bars.push(E('span', { 'class': 'is-idle', 'style': 'height:4%' }));

		return E('div', { 'class': 'sl-chart' }, bars);
	},

	kv: function(items) {
		return E('ul', { 'class': 'sl-kv' }, items.map(function(it) {
			return E('li', {}, [
				E('span', { 'class': 'sl-kv-key' }, it[0]),
				E('span', { 'class': cls('sl-kv-val', it[2] && 'sl-accent-' + it[2]) }, it[1])
			]);
		}));
	},

	steps: function(labels, current) {
		var kids = [];

		labels.forEach(function(label, i) {
			if (i)
				kids.push(E('span', { 'class': 'sl-step-line' }));

			var state = (i < current) ? 'is-done' : (i === current ? 'is-active' : '');

			kids.push(E('div', { 'class': cls('sl-step', state) }, [
				E('span', { 'class': 'sl-step-dot' }, (i < current) ? svg('check') : String(i + 1)),
				E('span', {}, label)
			]));
		});

		return E('div', { 'class': 'sl-steps' }, kids);
	},

	actions: function(children) {
		return E('div', { 'class': 'sl-actions' }, children);
	},

	button: function(o) {
		var kids = [];

		if (o.icon)
			kids.push(svg(o.icon));

		kids.push(E('span', {}, o.label));

		var attrs = {
			'class': cls('btn', o.variant ? 'cbi-button-' + o.variant : 'cbi-button-neutral',
			             o.icon && 'sl-btn-icon', o.class),
			'type': 'button'
		};

		if (o.href)
			return E('a', Object.assign(attrs, { 'href': o.href }), kids);

		if (o.click)
			attrs.click = o.click;

		return E('button', attrs, kids);
	},

	hero: function(o) {
		return E('div', { 'class': 'sl-hero' }, [
			E('div', { 'class': cls('sl-hero-icon', o.accent && 'sl-accent-' + o.accent) }, [ svg(o.icon) ]),
			E('h1', {}, o.title),
			o.subtitle ? E('p', { 'class': 'sl-tile-hint' }, o.subtitle) : ''
		]);
	}
});
