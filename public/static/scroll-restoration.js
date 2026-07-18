(() => {
	if (!('scrollRestoration' in history)) return;

	const navigation = performance.getEntriesByType('navigation')[0];
	const isReload = navigation?.type === 'reload';

	if (isReload) {
		history.scrollRestoration = 'manual';
		document.documentElement.style.visibility = 'hidden';
		addEventListener('load', () => {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					document.documentElement.style.visibility = '';
					history.scrollRestoration = 'auto';
				});
			});
		}, { once: true });
	}

	addEventListener('pagehide', () => {
		history.replaceState({
			...history.state,
			documentScrollPosition: { top: scrollY, left: scrollX },
		}, '');
	});
})();
