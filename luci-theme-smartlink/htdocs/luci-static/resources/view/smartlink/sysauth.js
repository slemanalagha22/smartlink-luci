'use strict';
'require view';

/*
 * Renders the login form inline inside the SMARTLink login card rather than
 * inside a modal dialog the way luci-theme-bootstrap does.
 *
 * The form must be RETURNED from render(): LuCI's view base class replaces the
 * contents of #view with whatever render() yields, so anything appended to
 * #view beforehand is discarded.
 */
return view.extend({
	render: function() {
		var form = document.querySelector('form'),
		    btn = document.querySelector('button'),
		    container = E('div', { 'class': 'sl-login-form' });

		document.querySelectorAll('section > *').forEach(function(node) {
			container.appendChild(node);
		});

		form.addEventListener('keypress', function(ev) {
			if (ev.key == 'Enter') {
				ev.preventDefault();
				btn.click();
			}
		});

		btn.addEventListener('click', function() {
			/* Hide, never remove: a detached form cannot be submitted. */
			container.querySelectorAll(':scope > *').forEach(function(node) {
				node.style.display = 'none';
			});

			container.appendChild(E('div', { 'class': 'spinning' }, _('Logging in…')));
			form.submit();
		});

		/* The field only exists once the section has been moved across. */
		var pw = container.querySelector('input[type="password"]');

		if (pw)
			pw.focus();

		return container;
	},

	addFooter: function() {}
});
