import { Head, Link, router, usePage } from '@inertiajs/react';
import { useEffect, useReducer, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import {
	ArrowLeft,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	DatabaseBackup,
	Download,
	ExternalLink,
	GitPullRequest,
	GripVertical,
	Link2,
	Pencil,
	RefreshCw,
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

type SettingsSection = 'general' | 'github' | 'shortcuts' | 'backups';

interface SettingsData {
	displayName: string;
	timeZone: string;
	timeFormat: TimeFormat;
	theme: ThemePreference;
	shortcutLimit: number;
	backupIntervalHours: number;
	backupRetentionDays: number;
	pullRequestWindowDays: number;
	githubTokenConfigured: boolean;
	repositoryScopes: string[];
	shortcutGroups: ShortcutGroupConfig[];
}

interface PageProps extends InertiaPageProps {
	applicationName: string;
	activeSection: SettingsSection;
	feedback: { type: 'success' | 'error'; message: string } | null;
	repositoryCatalog: (GitHubRepositoryCatalog & { selectedScopes: string[] }) | null;
	repositoryError: string;
	backupStatus: { count: number; lastBackupAt: string | null };
	settings: SettingsData;
}

interface BookmarkCandidate {
	id: string;
	label: string;
	url: string;
	selected: boolean;
}

interface BookmarkImporterState {
	open: boolean;
	bookmarks: BookmarkCandidate[];
	groupId: string;
	importing: boolean;
	error: string;
}

type BookmarkImporterAction =
	| { type: 'dialogChanged'; open: boolean }
	| { type: 'fileReadStarted' }
	| { type: 'bookmarksLoaded'; bookmarks: BookmarkCandidate[]; groupId: string }
	| { type: 'groupChanged'; groupId: string }
	| { type: 'selectionToggled'; bookmarkId: string }
	| { type: 'allSelectionsToggled' }
	| { type: 'importStarted' }
	| { type: 'importFinished' }
	| { type: 'failed'; message: string };

function bookmarkImporterReducer(state: BookmarkImporterState, action: BookmarkImporterAction): BookmarkImporterState {
	switch (action.type) {
		case 'dialogChanged':
			return { ...state, open: action.open };
		case 'fileReadStarted':
			return { ...state, error: '' };
		case 'bookmarksLoaded':
			return { ...state, open: true, bookmarks: action.bookmarks, groupId: action.groupId, error: '' };
		case 'groupChanged':
			return { ...state, groupId: action.groupId };
		case 'selectionToggled':
			return {
				...state,
				bookmarks: state.bookmarks.map(bookmark => bookmark.id === action.bookmarkId
					? { ...bookmark, selected: !bookmark.selected }
					: bookmark),
			};
		case 'allSelectionsToggled': {
			const selectAll = !state.bookmarks.every(bookmark => bookmark.selected);
			return { ...state, bookmarks: state.bookmarks.map(bookmark => ({ ...bookmark, selected: selectAll })) };
		}
		case 'importStarted':
			return { ...state, importing: true, error: '' };
		case 'importFinished':
			return { ...state, importing: false };
		case 'failed':
			return { ...state, error: action.message };
	}
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
	{ id: 'shortcuts' as const, label: 'Quick links', icon: Link2 },
	{ id: 'backups' as const, label: 'Backups', icon: DatabaseBackup },
];

function BookmarkImporter({
	groups,
	onImported,
}: {
	groups: ShortcutGroupConfig[];
	onImported: (groups: ShortcutGroupConfig[], message: string) => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [state, dispatch] = useReducer(bookmarkImporterReducer, {
		open: false,
		bookmarks: [],
		groupId: groups[0]?.id ?? '',
		importing: false,
		error: '',
	});
	const { open, bookmarks, groupId, importing, error } = state;

	const readBookmarks = async (file: File) => {
		dispatch({ type: 'fileReadStarted' });
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
			dispatch({ type: 'failed', message: 'No new web bookmarks were found in that file.' });
			return;
		}

		dispatch({ type: 'bookmarksLoaded', bookmarks: parsed, groupId: groups[0]?.id ?? '' });
	};

	const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) await readBookmarks(file);
		event.target.value = '';
	};

	const importSelected = () => {
		const selected = bookmarks.filter(bookmark => bookmark.selected);
		if (!groupId || selected.length === 0) return;
		dispatch({ type: 'importStarted' });
		router.post('/settings/shortcuts/bookmarks', {
			groupId,
			shortcuts: selected.map(bookmark => ({ label: bookmark.label.slice(0, 60), url: bookmark.url })),
		}, {
			preserveScroll: true,
			onSuccess: page => {
				const nextProps = page.props as unknown as PageProps;
				if (nextProps.feedback?.type === 'error') {
					dispatch({ type: 'failed', message: nextProps.feedback.message });
					return;
				}
				onImported(
					nextProps.settings.shortcutGroups,
					nextProps.feedback?.message ?? `${selected.length} bookmark${selected.length === 1 ? '' : 's'} imported.`,
				);
				dispatch({ type: 'dialogChanged', open: false });
			},
			onError: () => dispatch({ type: 'failed', message: 'Could not import bookmarks.' }),
			onFinish: () => dispatch({ type: 'importFinished' }),
		});
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

			<Dialog open={open} onOpenChange={nextOpen => dispatch({ type: 'dialogChanged', open: nextOpen })}>
				<DialogContent className="bookmark-dialog">
					<DialogHeader>
						<DialogTitle>Choose bookmarks</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor="bookmark-group">Add to</Label>
							<Select id="bookmark-group" value={groupId} onChange={event => dispatch({ type: 'groupChanged', groupId: event.target.value })}>
								{groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
							</Select>
						</div>
						<div className="flex items-center justify-between gap-3">
							<p className="text-sm text-muted-foreground">{bookmarks.length} bookmarks found</p>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => dispatch({ type: 'allSelectionsToggled' })}
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
										onChange={() => dispatch({ type: 'selectionToggled', bookmarkId: bookmark.id })}
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
							<Button type="button" variant="outline" onClick={() => dispatch({ type: 'dialogChanged', open: false })} disabled={importing}>Cancel</Button>
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

function RepositoryOwnerGroup({
	owner,
	repositories,
	selectedRepositories,
	searchQuery,
	onToggleScope,
}: {
	owner: string;
	repositories: GitHubRepository[];
	selectedRepositories: string[];
	searchQuery: string;
	onToggleScope: (scope: string, owner?: string) => void;
}) {
	const [state, dispatch] = useReducer((current: { expanded: boolean; page: number }, action: { type: 'toggle' | 'previous' | 'next' } | { type: 'searchChanged'; hasSearch: boolean }) => {
		switch (action.type) {
			case 'toggle': return { ...current, expanded: !current.expanded };
			case 'previous': return { ...current, page: current.page - 1 };
			case 'next': return { ...current, page: current.page + 1 };
			case 'searchChanged': return { ...current, expanded: action.hasSearch || current.expanded, page: 1 };
		}
	}, { expanded: false, page: 1 });
	useEffect(() => dispatch({ type: 'searchChanged', hasSearch: searchQuery.trim().length > 0 }), [searchQuery]);
	const expanded = state.expanded;
	const pageCount = Math.max(1, Math.ceil(repositories.length / REPOSITORIES_PER_PAGE));
	const page = Math.min(state.page, pageCount);
	const visibleRepositories = repositories.slice((page - 1) * REPOSITORIES_PER_PAGE, page * REPOSITORIES_PER_PAGE);
	const wildcard = `${owner}/*`;
	const wildcardSelected = selectedRepositories.includes(wildcard);

	return (
		<div className="border-b last:border-b-0">
			<div className="flex items-center bg-muted/40">
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					className="ml-2"
					aria-label={`${expanded ? 'Collapse' : 'Expand'} ${owner} repositories`}
					aria-expanded={expanded}
					onClick={() => dispatch({ type: 'toggle' })}
				>
					<ChevronRight className={expanded ? 'rotate-90 transition-transform' : 'transition-transform'} aria-hidden="true" />
				</Button>
				<label className="repository-option min-w-0 flex-1 pl-1 font-medium">
					<input type="checkbox" checked={wildcardSelected} onChange={() => onToggleScope(wildcard, owner)} />
					<span className="truncate">{wildcard}</span>
					<span className="ml-auto text-xs text-muted-foreground">All repositories</span>
				</label>
			</div>
			{expanded && visibleRepositories.map(repository => (
				<label key={repository.id} className="repository-option pl-12">
					<input
						type="checkbox"
						disabled={wildcardSelected}
						checked={wildcardSelected || selectedRepositories.includes(repository.fullName)}
						onChange={() => onToggleScope(repository.fullName)}
					/>
					<span className="truncate">{repository.name}</span>
					<span className="ml-auto text-xs text-muted-foreground">{repository.archived ? 'Archived' : repository.private ? 'Private' : 'Public'}</span>
				</label>
			))}
			{expanded && pageCount > 1 && (
				<div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
					<span>Page {page} of {pageCount}</span>
					<div className="flex gap-1">
						<Button type="button" variant="outline" size="icon-sm" aria-label={`Previous ${owner} repository page`} disabled={page === 1} onClick={() => dispatch({ type: 'previous' })}><ChevronLeft /></Button>
						<Button type="button" variant="outline" size="icon-sm" aria-label={`Next ${owner} repository page`} disabled={page === pageCount} onClick={() => dispatch({ type: 'next' })}><ChevronRight /></Button>
					</div>
				</div>
			)}
		</div>
	);
}

export default function Settings() {
	const { props } = usePage<PageProps>();
	const { activeSection: initialSection, applicationName, repositoryCatalog: initialRepositoryCatalog, repositoryError: initialRepositoryError, settings } = props;
	const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
	const [displayName, setDisplayName] = useState(settings.displayName);
	const [timeZone, setTimeZone] = useState(settings.timeZone);
	const [timeFormat, setTimeFormat] = useState<TimeFormat>(settings.timeFormat ?? '12');
	const [theme, setTheme] = useState<ThemePreference>(settings.theme ?? 'light');
	const [shortcutLimit, setShortcutLimit] = useState(settings.shortcutLimit);
	const [backupIntervalHours, setBackupIntervalHours] = useState(settings.backupIntervalHours);
	const [backupRetentionDays, setBackupRetentionDays] = useState(settings.backupRetentionDays);
	const [pullRequestWindowDays, setPullRequestWindowDays] = useState(settings.pullRequestWindowDays ?? 7);
	const [token, setToken] = useState('');
	const [repositoryCatalog, setRepositoryCatalog] = useState<GitHubRepositoryCatalog | null>(initialRepositoryCatalog);
	const [selectedRepositories, setSelectedRepositories] = useState(initialRepositoryCatalog?.selectedScopes ?? settings.repositoryScopes);
	const [repositorySearch, setRepositorySearch] = useState('');
	const [loadingRepositories, setLoadingRepositories] = useState(false);
	const [repositoryError, setRepositoryError] = useState(initialRepositoryError);
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
	const [backingUp, setBackingUp] = useState(false);
	const [message, setMessage] = useState(props.feedback?.message ?? '');
	const shortcutImportRef = useRef<HTMLInputElement>(null);

	const applySettingsPage = (page: { props: unknown }) => {
		const nextProps = page.props as PageProps;
		const next = nextProps.settings;
		setDisplayName(next.displayName);
		setTimeZone(next.timeZone);
		setTimeFormat(next.timeFormat);
		setTheme(next.theme);
		setShortcutLimit(next.shortcutLimit);
		setBackupIntervalHours(next.backupIntervalHours);
		setBackupRetentionDays(next.backupRetentionDays);
		setPullRequestWindowDays(next.pullRequestWindowDays);
		setGroups(next.shortcutGroups);
		setNewShortcutGroupId(current => next.shortcutGroups.some(group => group.id === current) ? current : next.shortcutGroups[0]?.id ?? '');
		setRepositoryCatalog(nextProps.repositoryCatalog);
		setSelectedRepositories(nextProps.repositoryCatalog?.selectedScopes ?? next.repositoryScopes);
		setRepositoryError(nextProps.repositoryError);
		if (nextProps.feedback) setMessage(nextProps.feedback.message);
		return nextProps;
	};

	const loadGithubRepositories = (refresh = false) => {
		setLoadingRepositories(true);
		setRepositoryError('');
		router.get('/settings', { section: 'github', ...(refresh ? { refresh: '1' } : {}) }, {
			only: ['repositoryCatalog', 'repositoryError'],
			preserveState: true,
			preserveScroll: true,
			replace: true,
			onSuccess: page => {
				const nextProps = page.props as unknown as PageProps;
				setRepositoryCatalog(nextProps.repositoryCatalog);
				setSelectedRepositories(nextProps.repositoryCatalog?.selectedScopes ?? settings.repositoryScopes);
				setRepositoryError(nextProps.repositoryError);
				window.history.replaceState(window.history.state, '', '/settings?section=github');
			},
			onError: () => setRepositoryError('Could not load repositories from GitHub.'),
			onFinish: () => setLoadingRepositories(false),
		});
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

	const saveGeneral = () => {
		setSaving(true);
		setMessage('');
		router.patch('/settings?section=general', { displayName, timeZone, timeFormat, theme }, {
			preserveScroll: true,
			onSuccess: applySettingsPage,
			onError: () => setMessage('Could not save general settings.'),
			onFinish: () => setSaving(false),
		});
	};

	const saveGithub = () => {
		setSaving(true);
		setMessage('');
		const replacingToken = token.trim().length > 0;
		router.patch('/settings?section=github', {
			githubToken: token || undefined,
			pullRequestWindowDays,
			...(repositoryCatalog && !replacingToken ? { repositoryScopes: selectedRepositories } : {}),
		}, {
			preserveScroll: true,
			onSuccess: page => {
				applySettingsPage(page);
				setToken('');
				router.prefetch('/', {}, { cacheFor: '30s' });
			},
			onError: () => setMessage('Could not save GitHub settings.'),
			onFinish: () => setSaving(false),
		});
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

	const addShortcut = (event: FormEvent) => {
		event.preventDefault();
		setSaving(true);
		setMessage('');
		router.post('/settings/shortcuts', {
			groupId: newShortcutGroupId,
			label: newShortcutLabel,
			url: newShortcutUrl,
			icon: 'link',
		}, {
			preserveScroll: true,
			onSuccess: page => {
				applySettingsPage(page);
				setNewShortcutLabel('');
				setNewShortcutUrl('');
			},
			onError: () => setMessage('Could not add quick link.'),
			onFinish: () => setSaving(false),
		});
	};

	const startEditingShortcut = (shortcut: ShortcutItem) => {
		setEditingShortcutId(shortcut.id);
		setEditingShortcutLabel(shortcut.label);
		setEditingShortcutUrl(shortcut.url);
		setConfirmDeleteId(null);
	};

	const saveShortcut = (shortcutId: string) => {
		setSaving(true);
		setMessage('');
		router.patch(`/settings/shortcuts/${encodeURIComponent(shortcutId)}`, {
			label: editingShortcutLabel,
			url: editingShortcutUrl,
		}, {
			preserveScroll: true,
			onSuccess: page => {
				applySettingsPage(page);
				setEditingShortcutId(null);
			},
			onError: () => setMessage('Could not update quick link.'),
			onFinish: () => setSaving(false),
		});
	};

	const deleteShortcut = (shortcutId: string) => {
		setSaving(true);
		setMessage('');
		router.delete(`/settings/shortcuts/${encodeURIComponent(shortcutId)}`, {
			preserveScroll: true,
			onSuccess: page => {
				applySettingsPage(page);
				setConfirmDeleteId(null);
			},
			onError: () => setMessage('Could not remove quick link.'),
			onFinish: () => setSaving(false),
		});
	};

	const saveShortcutLimit = () => {
		setSaving(true);
		setMessage('');
		router.patch('/settings?section=shortcuts', { shortcutLimit }, {
			preserveScroll: true,
			onSuccess: applySettingsPage,
			onError: () => setMessage('Could not save quick link limit.'),
			onFinish: () => setSaving(false),
		});
	};

	const saveBackups = () => {
		setSaving(true);
		setMessage('');
		router.patch('/settings?section=backups', { backupIntervalHours, backupRetentionDays }, {
			preserveScroll: true,
			onSuccess: applySettingsPage,
			onError: () => setMessage('Could not save backup settings.'),
			onFinish: () => setSaving(false),
		});
	};

	const backupNow = () => {
		setBackingUp(true);
		setMessage('');
		router.post('/settings/backups', {}, {
			preserveScroll: true,
			onSuccess: applySettingsPage,
			onError: () => setMessage('Could not create backup.'),
			onFinish: () => setBackingUp(false),
		});
	};

	const persistOrder = async (groupId: string, nextShortcuts: ShortcutGroupConfig['shortcuts'], previousShortcuts: ShortcutGroupConfig['shortcuts']) => {
		setGroups(current => current.map(group => group.id === groupId ? { ...group, shortcuts: nextShortcuts } : group));
		setMessage('Saving quick link order…');
		router.put('/settings/shortcuts/reorder', {
			groupId,
			shortcutIds: nextShortcuts.map(shortcut => shortcut.id),
		}, {
			preserveScroll: true,
			onSuccess: applySettingsPage,
			onError: () => {
				setGroups(current => current.map(group => group.id === groupId ? { ...group, shortcuts: previousShortcuts } : group));
				setMessage('Could not save quick link order.');
			},
		});
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

	const handleImported = (nextGroups: ShortcutGroupConfig[], feedbackMessage: string) => {
		setGroups(nextGroups);
		setMessage(feedbackMessage);
	};

	const importShortcutSettings = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		setSaving(true);
		setMessage('');
		try {
			const imported = JSON.parse(await file.text());
			router.post('/settings/shortcuts/import', imported, {
				preserveScroll: true,
				onSuccess: page => {
					applySettingsPage(page);
					setEditingShortcutId(null);
					setConfirmDeleteId(null);
				},
				onError: () => setMessage('Could not import quick links.'),
				onFinish: () => setSaving(false),
			});
		} catch (caught) {
			setMessage(caught instanceof SyntaxError
				? 'That file is not valid JSON.'
				: caught instanceof Error ? caught.message : 'Could not import quick links.');
			event.target.value = '';
			setSaving(false);
		}
		event.target.value = '';
	};

	const filteredRepositories = (repositoryCatalog?.repositories ?? []).filter(repository => {
		return fuzzyMatch(`${repository.fullName} ${repository.owner} ${repository.name}`, repositorySearch);
	});
	const filteredRepositoriesByOwner = filteredRepositories.reduce((owners, repository) => {
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
					<Button variant="ghost" className="-ml-6" render={<Link href="/" prefetch="hover" />}>
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
											Create token <ExternalLink aria-hidden="true" />
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
												<p className="text-sm text-muted-foreground">All pull requests in the selected repositories updated in the last {pullRequestWindowDays} {pullRequestWindowDays === 1 ? 'day' : 'days'} are included.</p>
											</div>
											<Button
												type="button"
												className="settings-action"
												variant="outline"
												size="icon-lg"
												aria-label="Refresh repositories"
												aria-busy={loadingRepositories}
												title="Refresh repositories"
												onClick={() => void loadGithubRepositories(true)}
												disabled={loadingRepositories}
											>
												<RefreshCw className={loadingRepositories ? 'animate-spin' : undefined} aria-hidden="true" />
											</Button>
										</div>
										{repositoryCatalog && (
											<div className="relative">
												<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
												<Input aria-label="Search repositories" value={repositorySearch} onChange={event => setRepositorySearch(event.target.value)} className="h-8 pl-9 text-sm" placeholder="Search repositories" />
											</div>
										)}
										{repositoryError && <p className="text-sm text-destructive" role="alert">{repositoryError}</p>}
										{repositoryCatalog && (
											<div className="repository-picker rounded-lg">
												<p className="border-b px-4 py-3 text-sm text-muted-foreground">Signed in as <span className="font-medium text-foreground">{repositoryCatalog.viewerLogin}</span> · {repositoryCatalog.repositories.length} accessible repositories</p>
												{Array.from(filteredRepositoriesByOwner.entries()).map(([owner, repositories]) => (
													<RepositoryOwnerGroup
														key={owner}
														owner={owner}
														repositories={repositories}
														selectedRepositories={selectedRepositories}
														searchQuery={repositorySearch}
														onToggleScope={toggleRepositoryScope}
													/>
												))}
												{filteredRepositories.length === 0 && <p className="p-4 text-sm text-muted-foreground">No matching repositories.</p>}
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

							{activeSection === 'backups' && (
								<section className="settings-panel rounded-lg" aria-labelledby="backup-settings-heading">
									<div>
										<h2 id="backup-settings-heading" className="display-heading settings-section-title">Backups</h2>
										<p className="mt-1 text-sm text-muted-foreground">Automatic database backups stored on disk.</p>
									</div>
									<div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
										<div className="flex min-w-0 items-center gap-3">
											<div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm">
												<DatabaseBackup className="size-5" aria-hidden="true" />
											</div>
											<div className="min-w-0">
												<p className="font-semibold">{props.backupStatus.count === 1 ? '1 backup' : `${props.backupStatus.count} backups`}</p>
												<p className="text-sm text-muted-foreground">
													{props.backupStatus.lastBackupAt
														? `Latest ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: settings.timeZone }).format(new Date(props.backupStatus.lastBackupAt))}`
														: 'No backup has been created yet.'}
												</p>
											</div>
										</div>
										<Button type="button" variant="outline" onClick={backupNow} disabled={backingUp || saving}>{backingUp ? 'Creating…' : 'Back up now'}</Button>
									</div>
									<div className="settings-form-grid">
										<div className="grid gap-2">
											<Label htmlFor="settings-backup-period">Backup frequency</Label>
											<div className="relative">
												<Select id="settings-backup-period" value={backupIntervalHours} onChange={event => setBackupIntervalHours(Number(event.target.value))} className="appearance-none pr-10">
													<option value={0}>Off</option>
													<option value={1}>Every hour</option>
													<option value={6}>Every 6 hours</option>
													<option value={12}>Every 12 hours</option>
													<option value={24}>Every day</option>
													<option value={168}>Every week</option>
												</Select>
												<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
											</div>
										</div>
										<div className="grid gap-2">
											<Label htmlFor="settings-backup-retention">Retention (days)</Label>
											<Input id="settings-backup-retention" type="number" min={1} max={365} value={backupRetentionDays} onChange={event => setBackupRetentionDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))} />
										</div>
									</div>
									<p className="-mt-3 text-sm text-muted-foreground">Expired backups are deleted automatically. The newest backup is always kept.</p>
									<div className="settings-save-action flex justify-end border-t pt-6">
										<Button type="button" onClick={saveBackups} disabled={saving || backingUp}>{saving ? 'Saving…' : 'Save settings'}</Button>
									</div>
								</section>
							)}

							{activeSection === 'shortcuts' && (
								<section className="settings-panel rounded-lg" aria-labelledby="shortcut-settings-heading">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div>
											<h2 id="shortcut-settings-heading" className="display-heading settings-section-title">Quick links</h2>
											<p className="mt-1 text-sm text-muted-foreground">Add, reorder, or edit quick links.</p>
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
									{groups.length === 0 && <p className="text-muted-foreground">No quick link groups configured.</p>}
									{groups.map(group => (
										<div key={group.id} className="shortcut-settings-group">
											<h3 className="text-sm font-semibold text-muted-foreground">{group.label}</h3>
											<div className="shortcut-sort-list" onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, group.id)}>
												{group.id === newShortcutGroupId && (
													<form onSubmit={addShortcut} className="shortcut-sort-item rounded-lg" data-static="true">
														<div className={groups.length > 1 ? 'grid min-w-0 flex-1 gap-2 sm:grid-cols-3' : 'grid min-w-0 flex-1 gap-2 sm:grid-cols-2'}>
															{groups.length > 1 && <Select id="new-shortcut-group" aria-label="Quick link group" value={newShortcutGroupId} onChange={event => setNewShortcutGroupId(event.target.value)}>{groups.map(shortcutGroup => <option key={shortcutGroup.id} value={shortcutGroup.id}>{shortcutGroup.label}</option>)}</Select>}
															<Input id="new-shortcut-label" aria-label="Quick link label" value={newShortcutLabel} onChange={event => setNewShortcutLabel(event.target.value)} placeholder="Label" maxLength={60} required />
															<Input id="new-shortcut-url" aria-label="Quick link URL" value={newShortcutUrl} onChange={event => setNewShortcutUrl(event.target.value)} placeholder="https://example.com" required />
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
														<Input aria-label="Quick link label" value={editingShortcutLabel} onChange={event => setEditingShortcutLabel(event.target.value)} maxLength={60} />
														<Input aria-label="Quick link URL" value={editingShortcutUrl} onChange={event => setEditingShortcutUrl(event.target.value)} />
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
											<p className="mt-1 text-sm text-muted-foreground">Export or import quick links.</p>
										</div>
										<div className="flex flex-wrap gap-2">
											<Button variant="outline" render={<a href="/settings/shortcuts/export" download />}>
												<Download aria-hidden="true" />
												Export quick links
											</Button>
											<input ref={shortcutImportRef} className="sr-only" type="file" accept=".json,application/json" onChange={importShortcutSettings} />
											<Button type="button" variant="outline" onClick={() => shortcutImportRef.current?.click()} disabled={saving}>
												<Upload aria-hidden="true" />
												Import quick links
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
