(() => {
	const root = document.documentElement;
	const darkMode = window.matchMedia('(prefers-color-scheme: dark)');

	const applyTheme = () => {
		const preference = root.dataset.theme || 'light';
		const dark = preference === 'dark' || (preference === 'system' && darkMode.matches);
		root.classList.toggle('dark', dark);
		root.style.colorScheme = dark ? 'dark' : 'light';
	};

	darkMode.addEventListener('change', applyTheme);
	window.addEventListener('yoda:theme-change', applyTheme);
	applyTheme();
})();
