import { useEffect, useMemo, useReducer, useRef } from 'react';
import { router } from '@inertiajs/react';
import { GitMergeIcon, GitPullRequestClosedIcon, GitPullRequestDraftIcon, GitPullRequestIcon } from '@primer/octicons-react';
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink, GitPullRequest, ListFilter, RefreshCw, UserCheck, X } from 'lucide-react';
import { Button } from '@/views/components/ui/button';
import { Card, CardContent } from '@/views/components/ui/card';
import type { DashboardResponse, PullRequestItem } from '@/types/dashboard';

interface PullRequestPanelProps {
	pullRequests: DashboardResponse['pullRequests'];
	persistedFilterState: string | null;
}

interface PullRequestPanelState {
	filters: AppliedFilter[];
	inputValue: string;
	pendingOperator: 'AND' | 'OR';
	page: number;
	refreshing: boolean;
	suggestionsOpen: boolean;
	suggestionMode: 'all' | 'token';
	activeSuggestion: number;
	suggestionLeft: number;
	editingFilterId: string | null;
}

type PullRequestPanelAction =
	| { type: 'inputChanged'; inputValue: string; showSuggestions: boolean }
	| { type: 'filterMenuToggled'; suggestionLeft: number }
	| { type: 'inputFocused'; suggestionLeft: number; suggestionMode: 'all' | 'token' }
	| { type: 'suggestionsClosed' }
	| { type: 'activeSuggestionChanged'; index: number }
	| { type: 'filterSelected'; inputValue: string }
	| { type: 'filterEditStarted'; filterId: string; suggestionLeft: number }
	| { type: 'operatorSelected' }
	| { type: 'operatorRemoved'; filterId?: string }
	| { type: 'suggestionApplied'; suggestion: FilterSuggestion }
	| { type: 'filterRemoved'; id: string }
	| { type: 'pageChanged'; page: number }
	| { type: 'refreshStarted' }
	| { type: 'refreshFinished'; resetPage?: boolean };

function pullRequestPanelReducer(state: PullRequestPanelState, action: PullRequestPanelAction): PullRequestPanelState {
	switch (action.type) {
		case 'inputChanged':
			return {
				...state,
				inputValue: action.inputValue,
				page: 1,
				suggestionsOpen: action.showSuggestions,
				suggestionMode: 'token',
				activeSuggestion: 0,
				editingFilterId: state.filters.find(filter => filter.id === state.editingFilterId)?.filter === filterForToken(currentSearchToken(action.inputValue))
					? state.editingFilterId
					: null,
			};
		case 'filterMenuToggled':
			return { ...state, suggestionsOpen: !state.suggestionsOpen || state.suggestionMode !== 'all', suggestionMode: 'all', activeSuggestion: 0, suggestionLeft: action.suggestionLeft, editingFilterId: null };
		case 'inputFocused':
			return { ...state, suggestionsOpen: true, suggestionMode: action.suggestionMode, activeSuggestion: 0, suggestionLeft: action.suggestionLeft, editingFilterId: null };
		case 'suggestionsClosed':
			return { ...state, suggestionsOpen: false, activeSuggestion: 0, editingFilterId: null };
		case 'activeSuggestionChanged':
			return { ...state, activeSuggestion: action.index };
		case 'filterSelected':
			return { ...state, inputValue: action.inputValue, suggestionsOpen: true, suggestionMode: 'token', activeSuggestion: 0, editingFilterId: null };
		case 'filterEditStarted':
			return { ...state, suggestionsOpen: true, suggestionMode: 'token', activeSuggestion: 0, suggestionLeft: action.suggestionLeft, editingFilterId: action.filterId };
		case 'operatorSelected':
			return { ...state, pendingOperator: 'OR', suggestionsOpen: false, activeSuggestion: 0 };
		case 'operatorRemoved':
			return action.filterId
				? { ...state, filters: state.filters.map(filter => filter.id === action.filterId ? { ...filter, operator: 'AND' } : filter), page: 1 }
				: { ...state, pendingOperator: 'AND' };
		case 'suggestionApplied': {
			const { suggestion } = action;
			const id = `${suggestion.filter}:${suggestion.value}`;
			const inputValue = inputWithoutCurrentFilter(state.inputValue);
			if (state.editingFilterId) {
				const editingIndex = state.filters.findIndex(filter => filter.id === state.editingFilterId);
				if (editingIndex >= 0) {
					const editingFilter = state.filters[editingIndex];
					const filters = state.filters
						.filter((filter, index) => index === editingIndex || filter.id !== id)
						.map(filter => filter.id === state.editingFilterId
							? { id, filter: suggestion.filter, value: suggestion.value, label: suggestion.label, operator: editingFilter.operator }
							: filter)
						.map((filter, index) => index === 0 ? { ...filter, operator: 'AND' as const } : filter);
					return { ...state, filters, inputValue, pendingOperator: 'AND', page: 1, suggestionsOpen: false, activeSuggestion: 0, editingFilterId: null };
				}
			}
			if (state.filters.some(filter => filter.id === id)) {
				return { ...state, inputValue, pendingOperator: 'AND', suggestionsOpen: false, activeSuggestion: 0, editingFilterId: null };
			}

			let filters = [...state.filters];
			if (state.pendingOperator === 'AND') {
				const existingIndex = filters.findIndex(filter => filter.filter === suggestion.filter);
				if (existingIndex >= 0) {
					filters[existingIndex] = { id, filter: suggestion.filter, value: suggestion.value, label: suggestion.label, operator: filters[existingIndex].operator };
					return { ...state, filters, inputValue, pendingOperator: 'AND', page: 1, suggestionsOpen: false, activeSuggestion: 0, editingFilterId: null };
				}
			}

			filters.push({
				id,
				filter: suggestion.filter,
				value: suggestion.value,
				label: suggestion.label,
				operator: state.pendingOperator,
			});
			return { ...state, filters, inputValue, pendingOperator: 'AND', page: 1, suggestionsOpen: false, activeSuggestion: 0, editingFilterId: null };
		}
		case 'filterRemoved': {
			const filters = state.filters.filter(filter => filter.id !== action.id).map((filter, index) => index === 0 ? { ...filter, operator: 'AND' as const } : filter);
			return { ...state, filters, pendingOperator: filters.length === 0 ? 'AND' : state.pendingOperator, page: 1, editingFilterId: state.editingFilterId === action.id ? null : state.editingFilterId };
		}
		case 'pageChanged':
			return { ...state, page: action.page };
		case 'refreshStarted':
			return { ...state, refreshing: true };
		case 'refreshFinished':
			return { ...state, refreshing: false, page: action.resetPage ? 1 : state.page };
	}
}

type SearchFilter = 'repo' | 'status' | 'involved';

interface FilterSuggestion {
	filter: SearchFilter;
	value: string;
	label: string;
}

interface AppliedFilter extends FilterSuggestion {
	id: string;
	operator: 'AND' | 'OR';
}

const FILTER_OPTIONS: Array<{
	filter: SearchFilter;
	label: string;
	icon: typeof GitPullRequest;
}> = [
	{ filter: 'status', label: 'Status', icon: GitPullRequest },
	{ filter: 'involved', label: 'Involved', icon: UserCheck },
	{ filter: 'repo', label: 'Repository', icon: BookOpen },
];

const STATUS_SUGGESTIONS: FilterSuggestion[] = [
	{ filter: 'status', value: 'open', label: 'Open' },
	{ filter: 'status', value: 'draft', label: 'Draft' },
	{ filter: 'status', value: 'merged', label: 'Merged' },
	{ filter: 'status', value: 'closed', label: 'Closed' },
];

const INVOLVED_SUGGESTIONS: FilterSuggestion[] = [
	{ filter: 'involved', value: 'true', label: 'True' },
	{ filter: 'involved', value: 'false', label: 'False' },
];

const PULL_REQUEST_FILTER_COOKIE = 'yoda_pull_request_filters';
const DEFAULT_FILTERS: AppliedFilter[] = [
	{ id: 'status:open', filter: 'status', value: 'open', label: 'Open', operator: 'AND' },
	{ id: 'involved:true', filter: 'involved', value: 'true', label: 'True', operator: 'AND' },
];

function labelForFilter(filter: SearchFilter, value: string): string | null {
	if (filter === 'status') return STATUS_SUGGESTIONS.find(suggestion => suggestion.value === value)?.label ?? null;
	if (filter === 'involved') return INVOLVED_SUGGESTIONS.find(suggestion => suggestion.value === value)?.label ?? null;
	return value.trim().length > 0 && value.length <= 200 ? value : null;
}

function initialPullRequestPanelState(persistedFilterState: string | null): PullRequestPanelState {
	let filters = DEFAULT_FILTERS;
	let inputValue = '';
	if (persistedFilterState) {
		try {
			const parsed = JSON.parse(persistedFilterState) as { filters?: unknown; inputValue?: unknown };
			if (Array.isArray(parsed.filters) && parsed.filters.length <= 20) {
				const restored: AppliedFilter[] = [];
				for (const value of parsed.filters) {
					if (!value || typeof value !== 'object') throw new Error('Invalid filter');
					const candidate = value as { filter?: unknown; value?: unknown; operator?: unknown };
					if ((candidate.filter !== 'repo' && candidate.filter !== 'status' && candidate.filter !== 'involved') || typeof candidate.value !== 'string') throw new Error('Invalid filter');
					const label = labelForFilter(candidate.filter, candidate.value);
					if (!label) throw new Error('Invalid filter');
					restored.push({
						id: `${candidate.filter}:${candidate.value}`,
						filter: candidate.filter,
						value: candidate.value,
						label,
						operator: restored.length > 0 && candidate.operator === 'OR' ? 'OR' : 'AND',
					});
				}
				filters = restored;
			}
			if (typeof parsed.inputValue === 'string') inputValue = parsed.inputValue.slice(0, 200);
		} catch {
			filters = DEFAULT_FILTERS;
			inputValue = '';
		}
	}
	return {
		filters,
		inputValue,
		pendingOperator: 'AND',
		page: 1,
		refreshing: false,
		suggestionsOpen: false,
		suggestionMode: 'all',
		activeSuggestion: 0,
		suggestionLeft: 0,
		editingFilterId: null,
	};
}

function currentSearchToken(query: string): string {
	return query.slice(query.lastIndexOf(' ') + 1);
}

function filterForToken(token: string): SearchFilter | null {
	const filter = token.slice(0, token.indexOf(':'));
	return filter === 'repo' || filter === 'status' || filter === 'involved' ? filter : null;
}

function beginFilter(inputValue: string, filter: SearchFilter): string {
	const trimmed = inputValue.trimEnd();
	return `${trimmed}${trimmed ? ' ' : ''}${filter}:`;
}

function replaceCurrentTokenWithFilter(inputValue: string, filter: SearchFilter): string {
	const token = currentSearchToken(inputValue);
	return `${inputValue.slice(0, inputValue.length - token.length)}${filter}:`;
}

function inputWithoutCurrentFilter(inputValue: string): string {
	const token = currentSearchToken(inputValue);
	if (!filterForToken(token)) return inputValue;
	return inputValue.slice(0, inputValue.length - token.length).trimEnd();
}

function matchesAppliedFilter(item: PullRequestItem, filter: AppliedFilter): boolean {
	if (filter.filter === 'status') return item.state === filter.value;
	if (filter.filter === 'involved') return item.involved === (filter.value === 'true');

	const repositoryName = item.repository.toLowerCase();
	const repository = filter.value.toLowerCase();
	if (repository.endsWith('/*')) return repositoryName.startsWith(`${repository.slice(0, -2)}/`);
	return repositoryName === repository || repositoryName.split('/').at(-1) === repository;
}

function matchesAppliedFilters(item: PullRequestItem, filters: AppliedFilter[]): boolean {
	if (filters.length === 0) return true;
	let expressionMatches = false;
	let groupMatches = true;
	filters.forEach((filter, index) => {
		const currentMatches = matchesAppliedFilter(item, filter);
		if (index > 0 && filter.operator === 'OR') {
			expressionMatches ||= groupMatches;
			groupMatches = currentMatches;
			return;
		}
		groupMatches &&= currentMatches;
	});
	return expressionMatches || groupMatches;
}

function formatRelativeAge(isoString: string): string {
	const date = new Date(isoString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return 'today';
	if (diffDays === 1) return '1 day ago';
	if (diffDays < 7) return `${diffDays} days ago`;
	if (diffDays < 14) return '1 week ago';
	const weeks = Math.floor(diffDays / 7);
	return `${weeks} weeks ago`;
}

function getStateLabel(state: PullRequestItem['state']): string {
	switch (state) {
		case 'open':
			return 'Open';
		case 'draft':
			return 'Draft';
		case 'merged':
			return 'Merged';
		case 'closed':
			return 'Closed';
	}
}

function PullRequestStateIcon({ state }: { state: PullRequestItem['state'] }) {
	const commonProps = { size: 20, 'aria-hidden': true } as const;
	switch (state) {
		case 'open':
			return <GitPullRequestIcon {...commonProps} className="text-[var(--github-pr-open)]" />;
		case 'draft':
			return <GitPullRequestDraftIcon {...commonProps} className="text-[var(--github-pr-draft)]" />;
		case 'merged':
			return <GitMergeIcon {...commonProps} className="text-[var(--github-pr-merged)]" />;
		case 'closed':
			return <GitPullRequestClosedIcon {...commonProps} className="text-[var(--github-pr-closed)]" />;
	}
}

function PullRequestRow({ item }: { item: PullRequestItem }) {
	return (
		<a
			href={item.url}
			target="_blank"
			rel="noreferrer noopener"
			className="flex items-start gap-3 px-4 py-4 no-underline sm:gap-4 sm:px-6"
		>
			<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
				<PullRequestStateIcon state={item.state} />
				<span className="sr-only">{getStateLabel(item.state)} pull request</span>
			</span>
			<div className="min-w-0 flex-1">
				<span className="block truncate text-base font-semibold leading-snug text-foreground">
					{item.title}
				</span>
				<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
					<span>
						{item.repository} #{item.number}
					</span>
					<span aria-hidden="true">·</span>
					<span>Updated {formatRelativeAge(item.updatedAt)}</span>
				</div>
			</div>
			<ExternalLink className="mt-1 size-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />
		</a>
	);
}

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

export default function PullRequestPanel({ pullRequests, persistedFilterState }: PullRequestPanelProps) {
	const { items } = pullRequests;
	const [state, dispatch] = useReducer(pullRequestPanelReducer, initialPullRequestPanelState(persistedFilterState));
	const { filters, inputValue, pendingOperator, refreshing, suggestionsOpen, suggestionMode, activeSuggestion, suggestionLeft, editingFilterId } = state;
	const searchContainerRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const pageSize = 10;
	const filteredItems = items.filter(item => {
		const matchesQuery = fuzzyMatch(`${item.repository} ${item.title} ${item.author} ${item.labels.join(' ')}`, inputWithoutCurrentFilter(inputValue));
		return matchesAppliedFilters(item, filters) && matchesQuery;
	});
	const searchToken = currentSearchToken(inputValue);
	const editingFilter = filters.find(filter => filter.id === editingFilterId);
	const searchTokenFilter = editingFilter?.filter ?? filterForToken(searchToken);
	const propertySuggestions = useMemo(() => {
		if (suggestionMode !== 'token' || searchTokenFilter) return [];
		return FILTER_OPTIONS.filter(option => fuzzyMatch(`${option.filter} ${option.label}`, searchToken));
	}, [searchToken, searchTokenFilter, suggestionMode]);
	const filterSuggestions = useMemo(() => {
		const repositories = Array.from(new Set(items.map(item => item.repository))).sort().map(repository => ({
			filter: 'repo' as const,
			value: repository,
			label: repository,
		}));
		const allSuggestions = [...STATUS_SUGGESTIONS, ...INVOLVED_SUGGESTIONS, ...repositories];
		if (suggestionMode === 'all' || !searchTokenFilter) return [];
		const value = editingFilter ? '' : searchToken.slice(searchToken.indexOf(':') + 1).toLowerCase();
		return allSuggestions.filter(suggestion => suggestion.filter === searchTokenFilter
			&& (`${suggestion.value} ${suggestion.label}`).toLowerCase().includes(value));
	}, [editingFilter, items, searchToken, searchTokenFilter, suggestionMode]);
	const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
	const page = Math.min(state.page, pageCount);
	const visibleItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
	const menuItemCount = suggestionMode === 'all'
		? FILTER_OPTIONS.length + 1
		: searchTokenFilter ? filterSuggestions.length : propertySuggestions.length;

	const refreshPullRequests = () => {
		router.post('/pull-requests/refresh', {}, {
			preserveScroll: true,
			onStart: () => dispatch({ type: 'refreshStarted' }),
			onSuccess: () => dispatch({ type: 'refreshFinished', resetPage: true }),
			onFinish: () => dispatch({ type: 'refreshFinished' }),
		});
	};

	useEffect(() => {
		const closeSuggestions = (event: PointerEvent) => {
			if (!searchContainerRef.current?.contains(event.target as Node)) {
				dispatch({ type: 'suggestionsClosed' });
			}
		};
		document.addEventListener('pointerdown', closeSuggestions);
		return () => document.removeEventListener('pointerdown', closeSuggestions);
	}, []);

	useEffect(() => {
		const value = encodeURIComponent(JSON.stringify({
			filters: filters.map(filter => ({ filter: filter.filter, value: filter.value, operator: filter.operator })),
			inputValue,
		}));
		document.cookie = `${PULL_REQUEST_FILTER_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
	}, [filters, inputValue]);

	const selectSuggestion = (suggestion: FilterSuggestion) => {
		if (!editingFilterId) searchInputRef.current?.focus();
		dispatch({ type: 'suggestionApplied', suggestion });
	};

	const selectFilter = (filter: SearchFilter, replaceCurrentToken = false) => {
		searchInputRef.current?.focus();
		dispatch({
			type: 'filterSelected',
			inputValue: replaceCurrentToken ? replaceCurrentTokenWithFilter(inputValue, filter) : beginFilter(inputValue, filter),
		});
	};

	const selectOperator = () => {
		if (filters.length === 0) return;
		searchInputRef.current?.focus();
		dispatch({ type: 'operatorSelected' });
	};

	const suggestionLeftForElement = (element: HTMLElement | null) => {
		const container = searchContainerRef.current?.getBoundingClientRect();
		const anchor = element?.getBoundingClientRect();
		if (!container || !anchor) return 0;
		const dropdownWidth = Math.min(288, window.innerWidth - 32, container.width);
		return Math.max(0, Math.min(anchor.left - container.left, container.width - dropdownWidth));
	};

	const inputSuggestionLeft = () => suggestionLeftForElement(searchInputRef.current);

	const openSuggestionsAtInput = () => {
		dispatch({
			type: 'inputFocused',
			suggestionLeft: inputSuggestionLeft(),
			suggestionMode: currentSearchToken(inputValue).trim() ? 'token' : 'all',
		});
	};

	const editFilter = (filter: AppliedFilter, anchor: HTMLButtonElement) => {
		dispatch({
			type: 'filterEditStarted',
			filterId: filter.id,
			suggestionLeft: suggestionLeftForElement(anchor),
		});
	};

	return (
		<section aria-label="Pull requests" className="flex flex-col gap-4">
			<div className="grid gap-3">
				<h2 className="display-heading text-base leading-snug text-foreground">Pull requests from the last {pullRequests.windowDays} {pullRequests.windowDays === 1 ? 'day' : 'days'}</h2>
				<div className="flex items-start gap-2">
					<div ref={searchContainerRef} className="relative min-w-0 flex-1">
						<div className="flex min-h-8 w-full items-center rounded-md border border-input bg-background text-sm shadow-xs">
							<Button type="button" variant="ghost" size="icon-sm" aria-label="Add pull request filter" aria-haspopup="listbox" aria-expanded={suggestionsOpen} onClick={() => dispatch({ type: 'filterMenuToggled', suggestionLeft: inputSuggestionLeft() })} className="shrink-0 bg-transparent hover:bg-transparent">
								<ListFilter aria-hidden="true" />
							</Button>
							<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-1 pr-2">
								{filters.map((filter, index) => (
									<span key={filter.id} className="contents">
										{index > 0 && filter.operator === 'OR' && (
											<button
												type="button"
												aria-label={`Remove OR before ${filter.label}`}
												onClick={() => dispatch({ type: 'operatorRemoved', filterId: filter.id })}
												className="flex h-6 items-center gap-1 rounded-md bg-accent px-2 text-xs font-medium text-accent-foreground"
											>
												OR <X className="size-3" aria-hidden="true" />
											</button>
										)}
									<span data-filter={`${filter.filter}:${filter.value}`} className="flex h-6 max-w-full items-center rounded-md bg-accent pl-2 pr-1 text-xs text-accent-foreground">
										<button type="button" aria-label={`Change ${FILTER_OPTIONS.find(option => option.filter === filter.filter)?.label} filter value`} aria-haspopup="listbox" aria-expanded={editingFilterId === filter.id && suggestionsOpen} onClick={event => editFilter(filter, event.currentTarget)} className="flex min-w-0 items-center gap-1">
											<span className="text-muted-foreground">{FILTER_OPTIONS.find(option => option.filter === filter.filter)?.label}:</span>
											<span className="truncate font-medium">{filter.label}</span>
										</button>
										<button type="button" aria-label={`Remove ${filter.label} filter`} onClick={() => dispatch({ type: 'filterRemoved', id: filter.id })} className="ml-0.5 shrink-0 text-muted-foreground hover:text-foreground">
												<X className="size-3" aria-hidden="true" />
											</button>
										</span>
									</span>
								))}
								{pendingOperator === 'OR' && (
									<button
										type="button"
										aria-label="Remove pending OR operator"
										onClick={() => dispatch({ type: 'operatorRemoved' })}
										className="flex h-6 items-center gap-1 rounded-md bg-accent px-2 text-xs font-medium text-accent-foreground"
									>
										OR <X className="size-3" aria-hidden="true" />
									</button>
								)}
								<input
									ref={searchInputRef}
									value={inputValue}
									onChange={event => {
										const nextValue = event.target.value;
										dispatch({ type: 'inputChanged', inputValue: nextValue, showSuggestions: true });
									}}
									onFocus={openSuggestionsAtInput}
									onClick={openSuggestionsAtInput}
									onKeyDown={event => {
										if (event.key === 'Backspace' && inputValue === '' && filters.length > 0) {
											dispatch({ type: 'filterRemoved', id: filters.at(-1)!.id });
											return;
										}
										if (!suggestionsOpen || menuItemCount === 0) return;
										if (event.key === 'ArrowDown') {
											event.preventDefault();
											dispatch({ type: 'activeSuggestionChanged', index: (activeSuggestion + 1) % menuItemCount });
										} else if (event.key === 'ArrowUp') {
											event.preventDefault();
											dispatch({ type: 'activeSuggestionChanged', index: (activeSuggestion - 1 + menuItemCount) % menuItemCount });
										} else if (event.key === 'Enter') {
											event.preventDefault();
											if (suggestionMode === 'all' && activeSuggestion === 0) selectOperator();
											else if (suggestionMode === 'all') selectFilter(FILTER_OPTIONS[activeSuggestion - 1].filter);
											else if (searchTokenFilter) selectSuggestion(filterSuggestions[activeSuggestion]);
											else selectFilter(propertySuggestions[activeSuggestion].filter, true);
										} else if (event.key === 'Escape') {
											dispatch({ type: 'suggestionsClosed' });
										}
									}}
									aria-label="Search and filter pull requests"
									aria-autocomplete="list"
									aria-controls="pull-request-filter-suggestions"
									placeholder="Enter property name or value"
									className="h-6 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
								/>
							</div>
						</div>
						{suggestionsOpen && (
								<div id="pull-request-filter-suggestions" role="listbox" style={{ left: suggestionLeft }} className="absolute top-full z-20 mt-1 max-h-72 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
								{suggestionMode === 'all' ? (
									<>
										<p className="px-2 py-1 text-xs font-medium text-muted-foreground">Operators</p>
										<button
											type="button"
											role="option"
											aria-selected={activeSuggestion === 0}
											disabled={filters.length === 0}
											onMouseDown={event => event.preventDefault()}
											onClick={selectOperator}
											className={`flex w-full items-center rounded-sm px-2 py-2 text-left text-sm disabled:opacity-50 ${activeSuggestion === 0 ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
										>
											OR
										</button>
										<p className="mt-1 border-t px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">Properties</p>
										{FILTER_OPTIONS.map((option, index) => {
											const Icon = option.icon;
											const itemIndex = index + 1;
											return (
												<button
													type="button"
													role="option"
													aria-selected={itemIndex === activeSuggestion}
													key={option.filter}
													onMouseDown={event => event.preventDefault()}
													onClick={() => selectFilter(option.filter)}
													className={`flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm ${itemIndex === activeSuggestion ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
												>
													<Icon className="size-4 text-muted-foreground" aria-hidden="true" />
													<span>{option.label}</span>
												</button>
											);
										})}
									</>
								) : searchTokenFilter ? filterSuggestions.map((suggestion, index) => (
									<button
										type="button"
										role="option"
										aria-selected={index === activeSuggestion}
										key={`${suggestion.filter}:${suggestion.value}`}
										onMouseDown={event => event.preventDefault()}
										onClick={() => selectSuggestion(suggestion)}
										className={`flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-sm ${index === activeSuggestion ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
									>
										<span className="truncate">{suggestion.label}</span>
									</button>
								)) : propertySuggestions.map((option, index) => {
									const Icon = option.icon;
									return (
										<button
											type="button"
											role="option"
											aria-selected={index === activeSuggestion}
											key={option.filter}
											onMouseDown={event => event.preventDefault()}
											onClick={() => selectFilter(option.filter, true)}
											className={`flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm ${index === activeSuggestion ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
										>
											<Icon className="size-4 text-muted-foreground" aria-hidden="true" />
											<span>{option.label}</span>
										</button>
									);
								})}
								{suggestionMode === 'token' && menuItemCount === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No matching filters</p>}
							</div>
						)}
					</div>
					<Button type="button" variant="outline" size="icon-sm" aria-label="Refresh pull requests" aria-busy={refreshing} title="Refresh pull requests" onClick={refreshPullRequests} disabled={refreshing}>
						<RefreshCw className={refreshing ? 'animate-spin' : undefined} aria-hidden="true" />
					</Button>
				</div>
			</div>
			<Card className="py-0">
				<CardContent className="p-0">
					{filteredItems.length === 0 ? (
						<div className="flex min-h-28 items-center justify-center text-muted-foreground">
							No pull requests match these filters
						</div>
					) : (
						<div>
							{visibleItems.map(item => (
								<div
									key={item.id}
									data-pull-request-id={item.id}
									className="border-b border-border last:border-b-0"
								>
									<PullRequestRow item={item} />
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
			{pageCount > 1 && (
				<div className="flex items-center justify-between text-sm text-muted-foreground">
					<span>Page {page} of {pageCount} · {filteredItems.length} pull requests</span>
					<div className="flex gap-1">
						<Button type="button" variant="outline" size="icon-sm" aria-label="Previous pull request page" disabled={page === 1} onClick={() => dispatch({ type: 'pageChanged', page: page - 1 })}><ChevronLeft /></Button>
						<Button type="button" variant="outline" size="icon-sm" aria-label="Next pull request page" disabled={page === pageCount} onClick={() => dispatch({ type: 'pageChanged', page: page + 1 })}><ChevronRight /></Button>
					</div>
				</div>
			)}
		</section>
	);
}
