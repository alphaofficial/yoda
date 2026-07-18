import { Head, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import {
	ArrowLeft,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Download,
	ExternalLink,
	GitPullRequest,
	GripVertical,
	Link2,
	Pencil,
	Search,
	Settings2,
	Trash2,
	Upload,
	X,
} from 'lucide-react';
import { Button } from '@/views/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/views/components/ui/dialog';
import { Input } from '@/views/components/ui/input';
import { Label } from '@/views/components/ui/label';
import { Select } from '@/views/components/ui/select';
import type { GitHubRepository, GitHubRepositoryCatalog, ShortcutGroupConfig, ShortcutItem, ThemePreference, TimeFormat } from '@/types/dashboard';
import type { PageProps as InertiaPageProps } from '@inertiajs/core';

type SettingsSection = 'general' | 'github' | 'shortcuts';

interface SettingsData {
	displayName: string;
	timeZone: string;
	timeFormat: TimeFormat;
	theme: ThemePreference;
	shortcutLimit: number;
	pullRequestWindowDays: number;
	githubTokenConfigured: boolean;
	repositories: string[];
	shortcutGroups: ShortcutGroupConfig[];
}

interface PageProps extends InertiaPageProps {
	applicationName: string;
	activeSection: SettingsSection;
	repositoryCatalog: (GitHubRepositoryCatalog & { selectedScopes: string[] }) | null;
	settings: SettingsData;
}

interface BookmarkCandidate {
	id: string;
	label: string;
	url: string;
	selected: boolean;
}

const TOKEN_URL = 'https://github.com/settings/tokens/new?description=Personal%20Dashboard&scopes=repo,read:org';
const REPOSITORIES_PER_PAGE = 20;
const TIME_ZONES = Array.from(new Set([
	'UTC',
	...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []),
]));

function fuzzyMatch(value: string, query: string): boolean {
	const haystack = value.toLowerCase();
	const needle = query.toLowerCase().trim();
	if (!needle) return true;
	let position = 0;
	for (const character of needle) {
		position = haystack.indexOf(character, position);
		if (position < 0) return false;
		position++;
	}
	return true;
}

const sections = [
	{ id: 'general' as const, label: 'General', icon: Settings2 },
	{ id: 'github' as const, label: 'GitHub', icon: GitPullRequest },
	{ id: 'shortcuts' as const, label: 'Shortcuts', icon: Link2 },
];

function BookmarkImporter({
	groups,
	onImported,
}: {
	groups: ShortcutGroupConfig[];
	onImported: (groupId: string, shortcuts: ShortcutItem[]) => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [bookmarks, setBookmarks] = useState<BookmarkCandidate[]>([]);
	const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
	const [importing, setImporting] = useState(false);
	const [error, setError] = useState('');

	const readBookmarks = async (file: File) => {
		setError('');
		const html = await file.text();
		const document = new DOMParser().parseFromString(html, 'text/html');
		const existingUrls = new Set(groups.flatMap(group => group.shortcuts.map(shortcut => shortcut.url)));
		const seen = new Set<string>();
		const parsed = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
			.map(anchor => ({ label: anchor.textContent?.trim() ?? '', url: anchor.href }))
			.filter(bookmark => {
				if (!/^https?:\/\//i.test(bookmark.url) || seen.has(bookmark.url) || existingUrls.has(bookmark.url)) return false;
				seen.add(bookmark.url);
				return true;
			})
			.map((bookmark, index) => ({
				id: `${index}-${bookmark.url}`,
				label: bookmark.label || new URL(bookmark.url).hostname,
				url: bookmark.url,
				selected: false,
			}));

		if (parsed.length === 0) {
			setError('No new web bookmarks were found in that file.');
			return;
		}

		setBookmarks(parsed);
		setGroupId(groups[0]?.id ?? '');
		setOpen(true);
	};

	const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) await readBookmarks(file);
		event.target.value = '';
	};

	const importSelected = async () => {
		const selected = bookmarks.filter(bookmark => bookmark.selected);
		if (!groupId || selected.length === 0) return;
		setImporting(true);
		setError('');
		const imported: ShortcutItem[] = [];

		try {
			for (const bookmark of selected) {
				const response = await fetch('/api/shortcuts', {
					method: 'POST',
					headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
					body: JSON.stringify({ groupId, label: bookmark.label.slice(0, 60), url: bookmark.url, icon: 'link' }),
				});
				if (!response.ok) throw new Error(`Could not import ${bookmark.label}`);
				const data = await response.json();
				imported.push(data.shortcut);
			}
			onImported(groupId, imported);
			setOpen(false);
		} catch (caught) {
			if (imported.length > 0) {
				onImported(groupId, imported);
				const importedUrls = new Set(imported.map(shortcut => shortcut.url));
				setBookmarks(current => current.filter(bookmark => !importedUrls.has(bookmark.url)));
			}
			setError(caught instanceof Error ? caught.message : 'Could not import bookmarks.');
		} finally {
			setImporting(false);
		}
	};

	const selectedCount = bookmarks.filter(bookmark => bookmark.selected).length;

	return (
		<>
			<input ref={fileInputRef} className="sr-only" type="file" accept=".html,.htm,text/html" onChange={handleFile} />
			<Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={groups.length === 0}>
				<Upload aria-hidden="true" />
				Import bookmarks
			</Button>
			{error && !open && <p className="text-sm text-destructive" role="alert">{error}</p>}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="bookmark-dialog">
					<DialogHeader>
						<DialogTitle>Choose bookmarks</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor="bookmark-group">Add to</Label>
							<Select id="bookmark-group" value={groupId} onChange={event => setGroupId(event.target.value)}>
								{groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
							</Select>
						</div>
						<div className="flex items-center justify-between gap-3">
							<p className="text-sm text-muted-foreground">{bookmarks.length} bookmarks found</p>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setBookmarks(items => items.map(item => ({ ...item, selected: selectedCount !== items.length })))}
							>
								{selectedCount === bookmarks.length ? 'Clear all' : 'Select all'}
							</Button>
						</div>
						<div className="bookmark-list" role="list">
							{bookmarks.map(bookmark => (
								<label key={bookmark.id} className="bookmark-option rounded-md">
									<input
										type="checkbox"
										checked={bookmark.selected}
										onChange={() => setBookmarks(items => items.map(item => item.id === bookmark.id ? { ...item, selected: !item.selected } : item))}
									/>
									<span className="min-w-0">
										<span className="block truncate font-medium">{bookmark.label}</span>
										<span className="block truncate text-sm text-muted-foreground">{bookmark.url}</span>
									</span>
								</label>
							))}
						</div>
						{error && <p className="text-sm text-destructive" role="alert">{error}</p>}
						<div className="flex justify-end gap-2">
							<Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={importing}>Cancel</Button>
							<Button type="button" onClick={importSelected} disabled={importing || selectedCount === 0}>
								{importing ? 'Importing…' : `Import selected${selectedCount ? ` (${selectedCount})` : ''}`}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

export default function Settings() {
	const { props } = usePage<PageProps>();
	const { activeSection: initialSection, applicationName, repositoryCatalog: initialRepositoryCatalog, settings } = props;
	const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
	const [displayName, setDisplayName] = useState(settings.displayName);
	const [timeZone, setTimeZone] = useState(settings.timeZone);
	const [timeFormat, setTimeFormat] = useState<TimeFormat>(settings.timeFormat ?? '12');
	const [theme, setTheme] = useState<ThemePreference>(settings.theme ?? 'light');
	const [shortcutLimit, setShortcutLimit] = useState(settings.shortcutLimit);
	const [pullRequestWindowDays, setPullRequestWindowDays] = useState(settings.pullRequestWindowDays ?? 7);
	const [token, setToken] = useState('');
	const [repositoryCatalog, setRepositoryCatalog] = useState<GitHubRepositoryCatalog | null>(initialRepositoryCatalog);
	const [selectedRepositories, setSelectedRepositories] = useState(initialRepositoryCatalog?.selectedScopes ?? settings.repositories);
	const [repositorySearch, setRepositorySearch] = useState('');
	const [repositoryPage, setRepositoryPage] = useState(1);
	const [loadingRepositories, setLoadingRepositories] = useState(false);
	const [repositoryError, setRepositoryError] = useState('');
	const [groups, setGroups] = useState(settings.shortcutGroups);
	const [newShortcutGroupId, setNewShortcutGroupId] = useState(settings.shortcutGroups[0]?.id ?? '');
	const [newShortcutLabel, setNewShortcutLabel] = useState('');
	const [newShortcutUrl, setNewShortcutUrl] = useState('');
	const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
	const [editingShortcutLabel, setEditingShortcutLabel] = useState('');
	const [editingShortcutUrl, setEditingShortcutUrl] = useState('');
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const [dragged, setDragged] = useState<{ groupId: string; shortcutId: string } | null>(null);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState('');
	const shortcutImportRef = useRef<HTMLInputElement>(null);

	const loadGithubRepositories = async (refresh = false) => {
		setLoadingRepositories(true);
		setRepositoryError('');
		try {
			const response = await fetch(`/api/settings/github/repositories${refresh ? '?refresh=1' : ''}`, { headers: { 'Accept': 'application/json' } });
			if (!response.ok) throw new Error(response.status === 401 ? 'Save a GitHub token before loading repositories.' : 'Could not load repositories from GitHub.');
			const data = await response.json() as GitHubRepositoryCatalog & { selectedScopes: string[] };
			setRepositoryCatalog(data);
			setSelectedRepositories(data.selectedScopes);
			setRepositoryPage(1);
		} catch (caught) {
			setRepositoryError(caught instanceof Error ? caught.message : 'Could not load repositories.');
		} finally {
			setLoadingRepositories(false);
		}
	};

	useEffect(() => {
		if (activeSection === 'github' && settings.githubTokenConfigured && !repositoryCatalog && !loadingRepositories) {
			void loadGithubRepositories();
		}
	}, [activeSection]);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		window.dispatchEvent(new Event('yoda:theme-change'));
	}, [theme]);

	const selectSection = (section: SettingsSection) => {
		setActiveSection(section);
		setMessage('');
		const url = new URL(window.location.href);
		url.searchParams.set('section', section);
		window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
	};

	const saveGeneral = async () => {
		setSaving(true);
		setMessage('');
		try {
			const response = await fetch('/api/settings', {
				method: 'PATCH',
				headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ displayName, timeZone, timeFormat, theme }),
			});
			if (!response.ok) throw new Error('Could not save general settings.');
			setMessage('General settings saved.');
		} catch (caught) {
			setMessage(caught instanceof Error ? caught.message : 'Could not save settings.');
		} finally {
			setSaving(false);
		}
	};

	const saveGithub = async () => {
		setSaving(true);
		setMessage('');
		try {
			const replacingToken = token.trim().length > 0;
			const settingsResponse = await fetch('/api/settings', {
				method: 'PATCH',
				headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ githubToken: token || undefined, pullRequestWindowDays }),
			});
			if (!settingsResponse.ok) throw new Error('Could not save the GitHub token.');

			if (repositoryCatalog && !replacingToken) {
				const repositoriesResponse = await fetch('/api/settings/repositories', {
					method: 'PUT',
					headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
					body: JSON.stringify({ repositories: selectedRepositories }),
				});
				if (!repositoriesResponse.ok) throw new Error('Could not save repository selection.');
			}
			setToken('');
			setMessage('GitHub settings saved.');
			if (!repositoryCatalog || replacingToken) await loadGithubRepositories();
		} catch (caught) {
			setMessage(caught instanceof Error ? caught.message : 'Could not save GitHub settings.');
		} finally {
			setSaving(false);
		}
	};

	const toggleRepositoryScope = (scope: string, owner?: string) => {
		setSelectedRepositories(current => {
			if (current.includes(scope)) return current.filter(item => item !== scope);
			if (scope.endsWith('/*') && owner) {
				return [...current.filter(item => !item.toLowerCase().startsWith(`${owner.toLowerCase()}/`)), scope];
			}
			return [...current, scope];
		});
	};

	const addShortcut = async (event: FormEvent) => {
		event.preventDefault();
		setSaving(true);
		setMessage('');
		try {
			const response = await fetch('/api/shortcuts', {
				method: 'POST',
				headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupId: newShortcutGroupId, label: newShortcutLabel, url: newShortcutUrl, icon: 'link' }),
			});
			if (!response.ok) throw new Error('Could not add shortcut.');
			const data = await response.json();
			setGroups(current => current.map(group => group.id === newShortcutGroupId ? { ...group, shortcuts: [...group.shortcuts, data.shortcut] } : group));
			setNewShortcutLabel('');
			setNewShortcutUrl('');
			setMessage('Shortcut added.');
		} catch (caught) {
			setMessage(caught instanceof Error ? caught.message : 'Could not add shortcut.');
		} finally {
			setSaving(false);
		}
	};

	const startEditingShortcut = (shortcut: ShortcutItem) => {
		setEditingShortcutId(shortcut.id);
		setEditingShortcutLabel(shortcut.label);
		setEditingShortcutUrl(shortcut.url);
		setConfirmDeleteId(null);
	};

	const saveShortcut = async (shortcutId: string) => {
		setSaving(true);
		setMessage('');
		try {
			const response = await fetch(`/api/shortcuts/${encodeURIComponent(shortcutId)}`, {
				method: 'PATCH',
				headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ label: editingShortcutLabel, url: editingShortcutUrl }),
			});
			if (!response.ok) throw new Error('Could not update shortcut.');
			const data = await response.json();
			setGroups(current => current.map(group => ({
				...group,
				shortcuts: group.shortcuts.map(shortcut => shortcut.id === shortcutId ? data.shortcut : shortcut),
			})));
			setEditingShortcutId(null);
			setMessage('Shortcut updated.');
		} catch (caught) {
			setMessage(caught instanceof Error ? caught.message : 'Could not update shortcut.');
		} finally {
			setSaving(false);
		}
	};

	const deleteShortcut = async (shortcutId: string) => {
		setSaving(true);
		setMessage('');
		try {
			const response = await fetch(`/api/shortcuts/${encodeURIComponent(shortcutId)}`, { method: 'DELETE', headers: { 'Accept': 'application/json' } });
			if (!response.ok) throw new Error('Could not remove shortcut.');
			setGroups(current => current.map(group => ({ ...group, shortcuts: group.shortcuts.filter(shortcut => shortcut.id !== shortcutId) })));
			setConfirmDeleteId(null);
			setMessage('Shortcut removed.');
		} catch (caught) {
			setMessage(caught instanceof Error ? caught.message : 'Could not remove shortcut.');
		} finally {
			setSaving(false);
		}
	};

	const saveShortcutLimit = async () => {
		setSaving(true);
		setMessage('');
		try {
			const response = await fetch('/api/settings', {
				method: 'PATCH',
				headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ shortcutLimit }),
			});
			if (!response.ok) throw new Error('Could not save shortcut display limit.');
			setMessage('Shortcut display limit saved.');
		} catch (caught) {
			setMessage(caught instanceof Error ? caught.message : 'Could not save shortcut display limit.');
		} finally {
			setSaving(false);
		}
	};

	const persistOrder = async (groupId: string, nextShortcuts: ShortcutGroupConfig['shortcuts'], previousShortcuts: ShortcutGroupConfig['shortcuts']) => {
		setGroups(current => current.map(group => group.id === groupId ? { ...group, shortcuts: nextShortcuts } : group));
		setMessage('Saving shortcut order…');
		try {
			const response = await fetch('/api/shortcuts/reorder', {
				method: 'PUT',
				headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupId, shortcutIds: nextShortcuts.map(shortcut => shortcut.id) }),
			});
			if (!response.ok) throw new Error('Could not save shortcut order.');
			setMessage('Shortcut order saved.');
		} catch (caught) {
			setGroups(current => current.map(group => group.id === groupId ? { ...group, shortcuts: previousShortcuts } : group));
			setMessage(caught instanceof Error ? caught.message : 'Could not save shortcut order.');
		}
	};

	const reorder = (groupId: string, shortcutId: string, targetId?: string) => {
		const group = groups.find(item => item.id === groupId);
		if (!group || shortcutId === targetId) return;
		const previous = group.shortcuts;
		const next = [...previous];
		const sourceIndex = next.findIndex(shortcut => shortcut.id === shortcutId);
		if (sourceIndex < 0) return;
		const [moved] = next.splice(sourceIndex, 1);
		const targetIndex = targetId ? next.findIndex(shortcut => shortcut.id === targetId) : next.length;
		next.splice(targetIndex < 0 ? next.length : targetIndex, 0, moved);
		void persistOrder(groupId, next, previous);
	};

	const handleDrop = (event: DragEvent, groupId: string, targetId?: string) => {
		event.preventDefault();
		if (dragged?.groupId === groupId) reorder(groupId, dragged.shortcutId, targetId);
		setDragged(null);
	};

	const moveBy = (groupId: string, shortcutId: string, delta: number) => {
		const group = groups.find(item => item.id === groupId);
		if (!group) return;
		const from = group.shortcuts.findIndex(shortcut => shortcut.id === shortcutId);
		const to = from + delta;
		if (from < 0 || to < 0 || to >= group.shortcuts.length) return;
		const previous = group.shortcuts;
		const next = [...previous];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		void persistOrder(groupId, next, previous);
	};

	const handleImported = (groupId: string, imported: ShortcutItem[]) => {
		setGroups(current => current.map(group => group.id === groupId ? { ...group, shortcuts: [...group.shortcuts, ...imported] } : group));
		setMessage(`${imported.length} bookmark${imported.length === 1 ? '' : 's'} imported.`);
	};

	const importShortcutSettings = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		setSaving(true);
		setMessage('');
		try {
			const imported = JSON.parse(await file.text());
			const response = await fetch('/api/settings/shortcuts/import', {
				method: 'POST',
				headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify(imported),
			});
			const data = await response.json() as { shortcutGroups?: ShortcutGroupConfig[]; error?: string };
			if (!response.ok || !data.shortcutGroups) {
				throw new Error(data.error ?? 'Could not import shortcuts.');
			}

			setGroups(data.shortcutGroups);
			setNewShortcutGroupId(data.shortcutGroups[0]?.id ?? '');
			setEditingShortcutId(null);
			setConfirmDeleteId(null);
			setMessage('Shortcuts imported. Existing shortcuts were replaced.');
		} catch (caught) {
			setMessage(caught instanceof SyntaxError
				? 'That file is not valid JSON.'
				: caught instanceof Error ? caught.message : 'Could not import shortcuts.');
		} finally {
			event.target.value = '';
			setSaving(false);
		}
	};

	const filteredRepositories = (repositoryCatalog?.repositories ?? []).filter(repository => {
		return fuzzyMatch(`${repository.fullName} ${repository.owner} ${repository.name}`, repositorySearch);
	});
	const repositoryPageCount = Math.max(1, Math.ceil(filteredRepositories.length / REPOSITORIES_PER_PAGE));
	const visibleRepositories = filteredRepositories.slice((repositoryPage - 1) * REPOSITORIES_PER_PAGE, repositoryPage * REPOSITORIES_PER_PAGE);
	const visibleRepositoriesByOwner = visibleRepositories.reduce((owners, repository) => {
		const entries = owners.get(repository.owner) ?? [];
		entries.push(repository);
		owners.set(repository.owner, entries);
		return owners;
	}, new Map<string, GitHubRepository[]>());
	const availableTimeZones = TIME_ZONES.includes(timeZone) ? TIME_ZONES : [timeZone, ...TIME_ZONES];

	return (
		<>
			<Head title={`Settings · ${applicationName}`} />
			<div className="min-h-screen bg-background text-foreground antialiased">
				<main className="settings-shell">
					<header className="settings-header">
						<Button variant="ghost" className="-ml-6" render={<a href="/" />}>
							<ArrowLeft aria-hidden="true" />
							Dashboard
						</Button>
						<div>
							<h1 className="display-heading page-heading text-foreground">Settings</h1>
							<p className="mt-1 text-muted-foreground">Configure your dashboard and integrations.</p>
						</div>
					</header>

					<div className="settings-layout">
						<aside className="settings-sidebar rounded-lg" aria-label="Settings navigation">
							<nav className="grid gap-1">
								{sections.map(section => {
									const Icon = section.icon;
									return (
										<button
											type="button"
											key={section.id}
											className="settings-nav-item rounded-md"
											data-active={activeSection === section.id}
											onClick={() => selectSection(section.id)}
										>
											<Icon aria-hidden="true" />
											{section.label}
										</button>
									);
								})}
							</nav>
						</aside>

						<div className="settings-content">
							{activeSection === 'general' && (
								<section className="settings-panel rounded-lg" aria-labelledby="general-settings-heading">
									<div>
										<h2 id="general-settings-heading" className="display-heading settings-section-title">General</h2>
										<p className="mt-1 text-sm text-muted-foreground">Personalize the greeting and local time shown on the dashboard.</p>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="settings-display-name">Display name</Label>
										<Input id="settings-display-name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={60} />
									</div>
									<div className="settings-form-grid">
										<div className="grid gap-2">
											<Label htmlFor="settings-time-zone">Time zone</Label>
											<div className="relative">
												<Select id="settings-time-zone" value={timeZone} onChange={event => setTimeZone(event.target.value)} className="appearance-none pr-10">
													{availableTimeZones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
												</Select>
												<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
											</div>
										</div>
										<div className="grid gap-2">
											<Label htmlFor="settings-time-format">Time format</Label>
											<div className="relative">
												<Select id="settings-time-format" value={timeFormat} onChange={event => setTimeFormat(event.target.value as TimeFormat)} className="appearance-none pr-10">
													<option value="12">12 hour</option>
													<option value="24">24 hour</option>
												</Select>
												<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
											</div>
										</div>
										<div className="grid gap-2">
											<Label htmlFor="settings-theme">Theme</Label>
											<div className="relative">
												<Select id="settings-theme" value={theme} onChange={event => setTheme(event.target.value as ThemePreference)} className="appearance-none pr-10">
													<option value="light">Light</option>
													<option value="dark">Dark</option>
													<option value="system">System</option>
												</Select>
												<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
											</div>
										</div>
									</div>
									<div className="flex justify-end"><Button type="button" onClick={saveGeneral} disabled={saving}>{saving ? 'Saving…' : 'Save general settings'}</Button></div>
								</section>
							)}

							{activeSection === 'github' && (
								<section className="settings-panel rounded-lg" aria-labelledby="github-settings-heading">
									<div className="settings-mobile-stack flex items-start justify-between gap-4">
										<div>
											<h2 id="github-settings-heading" className="display-heading settings-section-title">GitHub</h2>
											<p className="mt-1 text-sm text-muted-foreground">Choose repositories across every account your token can access.</p>
										</div>
										<Button className="settings-action" variant="outline" render={<a href={TOKEN_URL} target="_blank" rel="noreferrer noopener" />}>
											Create multi-org token <ExternalLink aria-hidden="true" />
										</Button>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="settings-github-token">Personal access token (classic)</Label>
										<Input id="settings-github-token" type="password" value={token} onChange={event => setToken(event.target.value)} placeholder={settings.githubTokenConfigured ? 'Token configured. Enter a new one to replace it' : 'ghp_…'} />
										<p className="text-sm text-muted-foreground">The classic token supports multiple organizations; authorize it for SSO organizations when required. A GitHub App user token is the least-privilege option for shared deployments.</p>
									</div>
									<div className="grid max-w-56 gap-2 max-sm:max-w-none">
										<Label htmlFor="settings-pr-window">Pull request history</Label>
										<div className="relative">
											<Select id="settings-pr-window" value={pullRequestWindowDays} onChange={event => setPullRequestWindowDays(Number(event.target.value))} className="appearance-none pr-10">
												<option value={1}>Last day</option>
												<option value={3}>Last 3 days</option>
												<option value={7}>Last 7 days</option>
												<option value={14}>Last 14 days</option>
												<option value={30}>Last 30 days</option>
											</Select>
											<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
										</div>
									</div>
									<div className="grid gap-3">
										<div className="settings-mobile-stack flex items-center justify-between gap-3">
											<div>
												<h3 className="font-semibold">Repositories</h3>
												<p className="text-sm text-muted-foreground">All selected repositories are searched for authored, review-requested, and reviewed pull requests updated in the last {pullRequestWindowDays} {pullRequestWindowDays === 1 ? 'day' : 'days'}.</p>
											</div>
											<Button type="button" className="settings-action" variant="outline" onClick={() => void loadGithubRepositories(true)} disabled={loadingRepositories}>{loadingRepositories ? 'Loading…' : 'Refresh'}</Button>
										</div>
										{repositoryCatalog && (
											<div className="relative">
												<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
												<Input aria-label="Search repositories" value={repositorySearch} onChange={event => { setRepositorySearch(event.target.value); setRepositoryPage(1); }} className="h-8 pl-9 text-sm" placeholder="Search repositories" />
											</div>
										)}
										{repositoryError && <p className="text-sm text-destructive" role="alert">{repositoryError}</p>}
										{repositoryCatalog && (
											<div className="repository-picker rounded-lg">
												<p className="border-b px-4 py-3 text-sm text-muted-foreground">Signed in as <span className="font-medium text-foreground">{repositoryCatalog.viewerLogin}</span> · {repositoryCatalog.repositories.length} accessible repositories</p>
												{Array.from(visibleRepositoriesByOwner.entries()).map(([owner, repositories]) => {
													const wildcard = `${owner}/*`;
													const wildcardSelected = selectedRepositories.includes(wildcard);
													return (
														<div key={owner} className="border-b last:border-b-0">
															<label className="repository-option bg-muted/40 font-medium">
																<input type="checkbox" checked={wildcardSelected} onChange={() => toggleRepositoryScope(wildcard, owner)} />
																<span>{owner}/*</span><span className="ml-auto text-xs text-muted-foreground">All repositories</span>
															</label>
															{repositories.map(repository => (
																<label key={repository.id} className="repository-option pl-9">
																	<input type="checkbox" disabled={wildcardSelected} checked={wildcardSelected || selectedRepositories.includes(repository.fullName)} onChange={() => toggleRepositoryScope(repository.fullName)} />
																	<span className="truncate">{repository.name}</span>
																	<span className="ml-auto text-xs text-muted-foreground">{repository.archived ? 'Archived' : repository.private ? 'Private' : 'Public'}</span>
																</label>
															))}
														</div>
													);
												})}
												{filteredRepositories.length === 0 && <p className="p-4 text-sm text-muted-foreground">No matching repositories.</p>}
											</div>
										)}
										{repositoryCatalog && repositoryPageCount > 1 && (
											<div className="flex items-center justify-between text-sm text-muted-foreground">
												<span>Page {repositoryPage} of {repositoryPageCount}</span>
												<div className="flex gap-1"><Button type="button" variant="outline" size="icon-sm" aria-label="Previous repository page" disabled={repositoryPage === 1} onClick={() => setRepositoryPage(page => page - 1)}><ChevronLeft /></Button><Button type="button" variant="outline" size="icon-sm" aria-label="Next repository page" disabled={repositoryPage === repositoryPageCount} onClick={() => setRepositoryPage(page => page + 1)}><ChevronRight /></Button></div>
											</div>
										)}
									</div>
									<div className="settings-save-action flex justify-end">
										<Button type="button" className="relative" onClick={saveGithub} disabled={saving} aria-busy={saving}>
											<span className={saving ? 'invisible' : undefined}>Save GitHub settings</span>
											{saving && <span className="absolute inset-0 flex items-center justify-center">Saving…</span>}
										</Button>
									</div>
								</section>
							)}

							{activeSection === 'shortcuts' && (
								<section className="settings-panel rounded-lg" aria-labelledby="shortcut-settings-heading">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div>
											<h2 id="shortcut-settings-heading" className="display-heading settings-section-title">Shortcuts</h2>
											<p className="mt-1 text-sm text-muted-foreground">Choose how many shortcuts appear, then add, reorder, or edit them below.</p>
										</div>
										<BookmarkImporter groups={groups} onImported={handleImported} />
									</div>
									<div className="flex flex-wrap items-end gap-3">
										<div className="grid w-full max-w-48 gap-2">
											<Label htmlFor="shortcut-display-limit">Dashboard display limit</Label>
											<Input id="shortcut-display-limit" type="number" min={1} max={50} value={shortcutLimit} onChange={event => setShortcutLimit(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} />
										</div>
										<Button type="button" variant="outline" className="shrink-0" onClick={saveShortcutLimit} disabled={saving}>Save limit</Button>
									</div>
									{groups.length === 0 && <p className="text-muted-foreground">No shortcut groups configured.</p>}
									{groups.map(group => (
										<div key={group.id} className="shortcut-settings-group">
											<h3 className="text-sm font-semibold text-muted-foreground">{group.label}</h3>
											<div className="shortcut-sort-list" onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, group.id)}>
												{group.id === newShortcutGroupId && (
													<form onSubmit={addShortcut} className="shortcut-sort-item rounded-lg" data-static="true">
														<div className={groups.length > 1 ? 'grid min-w-0 flex-1 gap-2 sm:grid-cols-3' : 'grid min-w-0 flex-1 gap-2 sm:grid-cols-2'}>
															{groups.length > 1 && <Select id="new-shortcut-group" aria-label="Shortcut group" value={newShortcutGroupId} onChange={event => setNewShortcutGroupId(event.target.value)}>{groups.map(shortcutGroup => <option key={shortcutGroup.id} value={shortcutGroup.id}>{shortcutGroup.label}</option>)}</Select>}
															<Input id="new-shortcut-label" aria-label="Shortcut label" value={newShortcutLabel} onChange={event => setNewShortcutLabel(event.target.value)} placeholder="Label" maxLength={60} required />
															<Input id="new-shortcut-url" aria-label="Shortcut URL" value={newShortcutUrl} onChange={event => setNewShortcutUrl(event.target.value)} placeholder="https://example.com" required />
														</div>
														<Button type="submit" size="sm" className="shrink-0" disabled={saving}>{saving ? 'Adding…' : 'Add'}</Button>
													</form>
												)}
												{group.shortcuts.map((shortcut, index) => (
													<div
														key={shortcut.id}
														className="shortcut-sort-item rounded-lg"
														draggable={editingShortcutId !== shortcut.id}
														data-dragging={dragged?.shortcutId === shortcut.id}
														onDragStart={event => { setDragged({ groupId: group.id, shortcutId: shortcut.id }); event.dataTransfer.effectAllowed = 'move'; }}
														onDragEnd={() => setDragged(null)}
														onDragOver={event => { event.preventDefault(); event.stopPropagation(); }}
														onDrop={event => { event.stopPropagation(); handleDrop(event, group.id, shortcut.id); }}
													>
														<GripVertical className="shortcut-drag-handle" aria-hidden="true" />
														{editingShortcutId === shortcut.id ? (
															<div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
																<Input aria-label="Shortcut label" value={editingShortcutLabel} onChange={event => setEditingShortcutLabel(event.target.value)} maxLength={60} />
																<Input aria-label="Shortcut URL" value={editingShortcutUrl} onChange={event => setEditingShortcutUrl(event.target.value)} />
															</div>
														) : (
															<div className="min-w-0 flex-1"><p className="truncate font-medium">{shortcut.label}</p><p className="truncate text-sm text-muted-foreground">{shortcut.url}</p></div>
														)}
														<div className="flex shrink-0 gap-1">
															{editingShortcutId === shortcut.id ? <><Button type="button" size="sm" onClick={() => void saveShortcut(shortcut.id)} disabled={saving}>Save</Button><Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel editing" onClick={() => setEditingShortcutId(null)}><X /></Button></> : <>
																<Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${shortcut.label} up`} onClick={() => moveBy(group.id, shortcut.id, -1)} disabled={index === 0}><ChevronUp /></Button>
																<Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${shortcut.label} down`} onClick={() => moveBy(group.id, shortcut.id, 1)} disabled={index === group.shortcuts.length - 1}><ChevronDown /></Button>
																<Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${shortcut.label}`} onClick={() => startEditingShortcut(shortcut)}><Pencil /></Button>
																{confirmDeleteId === shortcut.id ? <><Button type="button" variant="destructive" size="sm" onClick={() => void deleteShortcut(shortcut.id)} disabled={saving}>Remove</Button><Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel removal" onClick={() => setConfirmDeleteId(null)}><X /></Button></> : <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${shortcut.label}`} onClick={() => { setConfirmDeleteId(shortcut.id); setEditingShortcutId(null); }}><Trash2 /></Button>}
															</>}
														</div>
													</div>
												))}
											</div>
										</div>
									))}
									<div className="grid gap-3 border-t pt-6">
										<div>
											<h3 className="font-semibold">Backup and restore</h3>
											<p className="mt-1 text-sm text-muted-foreground">Export shortcuts to another dashboard instance. Importing replaces the shortcuts currently stored here.</p>
										</div>
										<div className="flex flex-wrap gap-2">
											<Button variant="outline" render={<a href="/api/settings/shortcuts/export" download />}>
												<Download aria-hidden="true" />
												Export shortcuts
											</Button>
											<input ref={shortcutImportRef} className="sr-only" type="file" accept=".json,application/json" onChange={importShortcutSettings} />
											<Button type="button" variant="outline" onClick={() => shortcutImportRef.current?.click()} disabled={saving}>
												<Upload aria-hidden="true" />
												Import shortcuts
											</Button>
										</div>
									</div>
								</section>
							)}

							{message && <p className="settings-message" role="status">{message}</p>}
						</div>
					</div>
				</main>
			</div>
		</>
	);
}
