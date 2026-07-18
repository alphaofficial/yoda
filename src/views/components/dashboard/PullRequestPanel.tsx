import { useState } from 'react';
import { GitMergeIcon, GitPullRequestClosedIcon, GitPullRequestDraftIcon, GitPullRequestIcon } from '@primer/octicons-react';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react';
import { Button } from '@/views/components/ui/button';
import { Card, CardContent } from '@/views/components/ui/card';
import { Input } from '@/views/components/ui/input';
import { Select } from '@/views/components/ui/select';
import type { DashboardResponse, PullRequestItem } from '@/types/dashboard';

interface PullRequestPanelProps {
	pullRequests: DashboardResponse['pullRequests'];
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
			className="flex items-start gap-4 px-6 py-4 no-underline"
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

export default function PullRequestPanel({ pullRequests }: PullRequestPanelProps) {
	const { items } = pullRequests;
	const [query, setQuery] = useState('');
	const [stateFilter, setStateFilter] = useState<PullRequestItem['state'] | 'all'>('open');
	const [reviewFilter, setReviewFilter] = useState<PullRequestItem['reviewState'] | 'all'>('review_required');
	const [page, setPage] = useState(1);
	const pageSize = 10;
	const filteredItems = items.filter(item => {
		const matchesState = stateFilter === 'all' || item.state === stateFilter;
		const matchesReview = reviewFilter === 'all' || item.reviewState === reviewFilter;
		const matchesQuery = fuzzyMatch(`${item.repository} ${item.title} ${item.author} ${item.labels.join(' ')}`, query);
		return matchesState && matchesReview && matchesQuery;
	});
	const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
	const visibleItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);

	const changeStateFilter = (nextState: PullRequestItem['state'] | 'all') => {
		setStateFilter(nextState);
		if (nextState !== 'open') setReviewFilter('all');
		setPage(1);
	};

	return (
		<section aria-label="Pull requests" className="flex flex-col gap-4">
			<div className="grid gap-3">
				<h2 className="display-heading text-base leading-snug text-foreground">Pull requests from the last {pullRequests.windowDays} {pullRequests.windowDays === 1 ? 'day' : 'days'}</h2>
				<div className="flex flex-wrap items-stretch gap-2">
					<div className="relative min-w-56 flex-1">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
						<Input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} aria-label="Search pull requests and repositories" placeholder="Search pull requests or repositories" className="h-8 pl-9 text-sm" />
					</div>
					<div className="relative w-28 shrink-0">
						<Select aria-label="Filter pull requests by state" value={stateFilter} onChange={event => changeStateFilter(event.target.value as PullRequestItem['state'] | 'all')} className="h-8 appearance-none py-1 pr-9 text-sm leading-none">
							<option value="open">Open</option>
							<option value="draft">Draft</option>
							<option value="merged">Merged</option>
							<option value="closed">Closed</option>
							<option value="all">All states</option>
						</Select>
						<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
					</div>
					<div className="relative w-44 shrink-0">
						<Select aria-label="Filter pull requests by review state" value={reviewFilter} disabled={stateFilter !== 'open'} onChange={event => { setReviewFilter(event.target.value as PullRequestItem['reviewState'] | 'all'); setPage(1); }} className="h-8 appearance-none py-1 pr-9 text-sm leading-none">
							<option value="review_required">Review required</option>
							<option value="all">Any review state</option>
							<option value="approved">Approved</option>
							<option value="changes_requested">Changes requested</option>
						</Select>
						<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
					</div>
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
						<Button type="button" variant="outline" size="icon-sm" aria-label="Previous pull request page" disabled={page === 1} onClick={() => setPage(current => current - 1)}><ChevronLeft /></Button>
						<Button type="button" variant="outline" size="icon-sm" aria-label="Next pull request page" disabled={page === pageCount} onClick={() => setPage(current => current + 1)}><ChevronRight /></Button>
					</div>
				</div>
			)}
		</section>
	);
}
