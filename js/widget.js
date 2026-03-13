/**
 * Create a reusable alert widget
 * 
 * Usage Examples:
 * 
 * // Basic alert
 * alertWidget('This is a basic alert');
 * 
 * // Success alert with auto-dismiss
 * alertWidget('Operation completed successfully!', {
 *     type: 'success',
 *     autoDismiss: 3000
 * });
 * 
 * // Custom icon alert
 * alertWidget('New message received', {
 *     type: 'info',
 *     icon: '📧',
 *     container: '#alertContainer'
 * });
 * 
 * // Non-dismissible alert
 * alertWidget('Please complete the form', {
 *     type: 'warning',
 *     dismissible: false
 * });
 * 
 * @param {string} message - The alert message
 * @param {object} options - Configuration options
 * @param {string} options.type - Alert type: 'success', 'warning', 'danger', 'info', 'primary' (default: 'primary')
 * @param {string} options.icon - Custom icon/emoji to display (default: auto based on type)
 * @param {boolean} options.dismissible - Whether alert can be dismissed (default: true)
 * @param {number} options.autoDismiss - Auto-dismiss after milliseconds (0 = no auto-dismiss, default: 0)
 * @param {string|HTMLElement|jQuery} options.container - Container to append alert to (default: body)
 * @param {string} options.position - Position in container: 'prepend' or 'append' (default: 'prepend')
 * @returns {jQuery} The created alert element
 */
globalThis.alertWidget = function (message, options = {}) {
	const defaults = {
		type: 'primary',
		icon: null,
		dismissible: true,
		autoDismiss: 0,
		container: 'body',
		position: 'prepend'
	};

	const config = { ...defaults, ...options };

	// Icon mapping based on type
	const iconMap = {
		success: '✓',
		warning: '⚠',
		danger: '✕',
		info: 'ℹ',
		primary: '●'
	};

	// Get the template
	const $template = $('#alertTemplate');
	if (!$template.length) {
		console.error('Alert template not found');
		return null;
	}

	// Clone the template content
	const $alert = $($template.html());

	// Set alert type
	$alert.removeClass('alert-primary alert-success alert-warning alert-danger alert-info');
	$alert.addClass(`alert-${config.type}`);

	// Set icon
	const icon = config.icon || iconMap[config.type] || '';
	$alert.find('.alert-icon').text(icon);

	// Set message
	$alert.find('.alert-message').text(message);

	// Handle dismissible
	if (!config.dismissible) {
		$alert.removeClass('alert-dismissible');
		$alert.find('.btn-close').remove();
	}

	// Get container
	const $container = $(config.container);
	if (!$container.length) {
		console.error('Alert container not found');
		return null;
	}

	// Append to container
	if (config.position === 'prepend') {
		$container.prepend($alert);
	} else {
		$container.append($alert);
	}

	// Auto-dismiss
	if (config.autoDismiss > 0) {
		setTimeout(() => {
			$alert.fadeOut(300, function () {
				$(this).remove();
			});
		}, config.autoDismiss);
	}

	return $alert;
}
