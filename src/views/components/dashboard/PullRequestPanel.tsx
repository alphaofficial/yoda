import { ExternalLink, GitPullRequest } from 'lucide-react';
import { Badge } from '@/views/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/views/components/ui/card';
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

function getReviewBadgeVariant(
	reviewState: PullRequestItem['reviewState']
): 'secondary' | 'default' | 'destructive' {
	switch (reviewState) {
		case 'approved':
			return 'default';
		case 'changes_requested':
			return 'destructive';
		case 'review_required':
		case 'draft':
			return 'secondary';
	}
}

function getReviewBadgeLabel(reviewState: PullRequestItem['reviewState']): string {
	switch (reviewState) {
		case 'approved':
			return 'Approved';
		case 'changes_requested':
			return 'Changes requested';
		case 'review_required':
			return 'Review required';
		case 'draft':
			return 'Draft';
	}
}

function getStateBadgeVariant(state: PullRequestItem['state']): 'secondary' | 'default' {
	switch (state) {
		case 'open':
			return 'default';
		case 'draft':
		case 'merged':
		case 'closed':
			return 'secondary';
	}
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

function PullRequestRow({ item }: { item: PullRequestItem }) {
	const displayLabels = item.labels.slice(0, 3);
	const extraLabelCount = item.labels.length - 3;

	return (
		<a
			href={item.url}
			target="_blank"
			rel="noreferrer noopener"
			className="flex items-center gap-3 px-7 py-6 no-underline transition-colors hover:bg-muted/50"
		>
			<GitPullRequest
				className="size-5 shrink-0 text-primary"
				aria-hidden="true"
			/>
			<div className="flex min-w-0 flex-col gap-1">
				<span className="truncate text-[18px]/[28px] font-medium text-foreground">
					{item.title}
				</span>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]/[22px] text-muted-foreground">
					<span>
						{item.repository} #{item.number}
					</span>
					<span aria-hidden="true">·</span>
					<span>{item.author}</span>
					<span aria-hidden="true">·</span>
					<span>{formatRelativeAge(item.updatedAt)}</span>
				</div>
			</div>
			<div className="ml-auto flex shrink-0 items-center gap-2">
				<Badge variant={getReviewBadgeVariant(item.reviewState)} className="text-[12px]/[18px]">
					{getReviewBadgeLabel(item.reviewState)}
				</Badge>
				{displayLabels.map(label => (
					<Badge key={label} variant="outline" className="text-[12px]/[18px]">
						{label}
					</Badge>
				))}
				{extraLabelCount > 0 && (
					<Badge variant="outline" className="text-[12px]/[18px]">
						+{extraLabelCount}
					</Badge>
				)}
				<ExternalLink
					className="size-4 text-muted-foreground"
					aria-hidden="true"
				/>
			</div>
		</a>
	);
}

function MetricCell({
	label,
	value
}: {
	label: string;
	value: number;
}) {
	return (
		<div className="flex flex-col items-center justify-center px-6">
			<span className="text-[16px]/[24px] font-normal text-muted-foreground">
				{label}
			</span>
			<span className="text-[24px]/[32px] font-bold text-foreground">
				{value}
			</span>
		</div>
	);
}

export default function PullRequestPanel({ pullRequests }: PullRequestPanelProps) {
	const { counts, items } = pullRequests;

	return (
		<section aria-label="Pull requests">
			<Card
				className="rounded-[20px] border shadow-[0_1px_2px_rgb(0_0_0_/_0.035)]"
				style={{ '--card-spacing': '0' } as React.CSSProperties}
			>
				<CardHeader className="px-6 pt-6">
					<CardTitle className="text-[28px]/[34px] font-bold text-foreground" style={{ letterSpacing: '-0.02em' }}>
						Pull requests from the last 7 days
					</CardTitle>
				</CardHeader>
				<CardContent className="px-0 pb-0">
					<div
						className="grid h-28 grid-cols-4 gap-0 border-b border-border px-6 max-sm:grid-cols-2 max-sm:h-22"
						style={{ borderTopWidth: '1px', borderBottomWidth: '1px' }}
					>
						<MetricCell label="Open PRs" value={counts.open} />
						<div className="border-l border-border" />
						<MetricCell label="Drafts" value={counts.draft} />
						<div className="border-l border-border" />
						<MetricCell label="Merged" value={counts.merged} />
						<div className="border-l border-border" />
						<MetricCell label="Closed" value={counts.closed} />
					</div>
					{items.length === 0 ? (
						<div className="flex items-center justify-center py-12 text-[15px]/[22px] text-muted-foreground">
							No pull requests in the last 7 days
						</div>
					) : (
						<div>
							{items.map((item, index) => (
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
		</section>
	);
}
