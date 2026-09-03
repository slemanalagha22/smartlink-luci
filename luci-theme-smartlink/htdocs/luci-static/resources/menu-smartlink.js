'use strict';
'require baseclass';
'require ui';

/* SMARTLink menu renderer.
   Derived from menu-bootstrap.js (Apache-2.0), extended with active-item
   marking, a click-driven dropdown, the mobile drawer and the theme toggle. */
return baseclass.extend({
	__init__() {
		ui.menu.load().then(L.bind(this.render, this));
	},

	render(tree) {
		let node = tree;
		let url = '';

		this.renderModeMenu(tree);

		if (L.env.dispatchpath.length >= 3) {
			for (let i = 0; i < 3 && node; i++) {
				node = node.children[L.env.dispatchpath[i]];
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node)
				this.renderTabMenu(node, url);
		}

		this.setupChrome();
	},

	renderTabMenu(tree, url, level) {
		const container = document.querySelector('#tabmenu');
		const ul = E('ul', { 'class': 'tabs' });
		const children = ui.menu.getChildren(tree);
		let activeNode = null;

		children.forEach(child => {
			const isActive = (L.env.dispatchpath[3 + (level || 0)] == child.name);
			const className = 'tabmenu-item-%s %s'.format(child.name, isActive ? 'active' : '');

			ul.appendChild(E('li', { 'class': className }, [
				E('a', { 'href': L.url(url, child.name) }, [ _(child.title) ])
			]));

			if (isActive)
				activeNode = child;
		});

		if (ul.children.length == 0)
			return E([]);

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	renderMainMenu(tree, url, level) {
		const ul = level ? E('ul', { 'class': 'dropdown-menu' }) : document.querySelector('#topmenu');
		const children = ui.menu.getChildren(tree);

		if (children.length == 0 || level > 1)
			return E([]);

		children.forEach(child => {
			const submenu = this.renderMainMenu(child, url + '/' + child.name, (level || 0) + 1);
			const hasSub = !!submenu.firstElementChild;

			/* dispatchpath is [mode, category, page, ...]; level 0 items are
			   categories, level 1 items are pages within a category. */
			const isActive = (L.env.dispatchpath[1 + (level || 0)] == child.name);

			const classes = [];
			if (!level && hasSub) classes.push('dropdown');
			if (isActive) classes.push('active');

			const li = E('li', { 'class': classes.join(' ') }, [
				E('a', {
					'class': (!level && hasSub) ? 'menu' : '',
					'href': hasSub ? '#' : L.url(url, child.name),
					'aria-expanded': (!level && hasSub) ? 'false' : null
				}, [ _(child.title) ]),
				submenu
			]);

			ul.appendChild(li);
		});

		ul.style.display = '';

		return ul;
	},

	renderModeMenu(tree) {
		const ul = document.querySelector('#modemenu');
		const children = ui.menu.getChildren(tree);

		children.forEach((child, index) => {
			const isActive = L.env.requestpath.length
				? child.name === L.env.requestpath[0]
				: index === 0;

			ul.appendChild(E('li', { 'class': isActive ? 'active' : '' }, [
				E('a', { 'href': L.url(child.name) }, [ _(child.title) ])
			]));

			if (isActive)
				this.renderMainMenu(child, child.name);
		});

		if (ul.children.length > 1)
			ul.style.display = '';
	},

	/* Theme toggle, mobile drawer and dropdown behaviour. */
	setupChrome() {
		const root = document.documentElement;
		const topmenu = document.querySelector('#topmenu');

		const toggle = document.querySelector('#sl-theme-toggle');
		if (toggle) {
			toggle.addEventListener('click', () => {
				const order = [ 'auto', 'light', 'dark' ];
				const current = root.getAttribute('data-theme-pref') || 'auto';
				const next = order[(order.indexOf(current) + 1) % order.length];

				if (typeof window.smartlinkApplyTheme === 'function')
					window.smartlinkApplyTheme(next);
			});
		}

		const burger = document.querySelector('#sl-menu-toggle');
		if (burger && topmenu) {
			burger.addEventListener('click', () => {
				const open = topmenu.classList.toggle('sl-open');
				burger.setAttribute('aria-expanded', open ? 'true' : 'false');
			});
		}

		/* Dropdowns open on click so they work on touch devices too. */
		if (topmenu) {
			topmenu.addEventListener('click', ev => {
				const link = ev.target.closest('li.dropdown > a.menu');
				if (!link)
					return;

				ev.preventDefault();

				const li = link.parentNode;
				const wasOpen = li.classList.contains('sl-open');

				topmenu.querySelectorAll('li.sl-open').forEach(n => {
					n.classList.remove('sl-open');
					n.firstElementChild?.setAttribute('aria-expanded', 'false');
				});

				if (!wasOpen) {
					li.classList.add('sl-open');
					link.setAttribute('aria-expanded', 'true');
				}
			});
		}

		document.addEventListener('click', ev => {
			if (topmenu && !ev.target.closest('#topmenu') && !ev.target.closest('#sl-menu-toggle')) {
				topmenu.querySelectorAll('li.sl-open').forEach(n => {
					n.classList.remove('sl-open');
					n.firstElementChild?.setAttribute('aria-expanded', 'false');
				});
			}
		});

		document.addEventListener('keydown', ev => {
			if (ev.key !== 'Escape' || !topmenu)
				return;

			topmenu.classList.remove('sl-open');
			topmenu.querySelectorAll('li.sl-open').forEach(n => {
				n.classList.remove('sl-open');
				n.firstElementChild?.setAttribute('aria-expanded', 'false');
			});
			document.querySelector('#sl-menu-toggle')?.setAttribute('aria-expanded', 'false');
		});
	}
});
