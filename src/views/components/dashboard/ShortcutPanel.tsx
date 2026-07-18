import { useState } from 'react';
import { CalendarDays, Columns3, ExternalLink, Gem, GitPullRequest, Link, Search } from 'lucide-react';
import { Card } from '@/views/components/ui/card';
import { Input } from '@/views/components/ui/input';
import type { DashboardResponse, ShortcutIcon, ShortcutItem } from '@/types/dashboard';

interface ShortcutPanelProps {
	shortcutGroups: DashboardResponse['shortcutGroups'];
	limit: number;
}

const ICON_MAP: Record<ShortcutIcon, typeof CalendarDays> = {
	calendar: CalendarDays,
	github: GitPullRequest,
	jira: Columns3,
	link: Link,
	obsidian: Gem,
};

function ShortcutCard({ item }: { item: ShortcutItem }) {
	const IconComponent = ICON_MAP[item.icon];
	const isObsidian = item.icon === 'obsidian';
	const [faviconFailed, setFaviconFailed] = useState(false);
	let faviconUrl: string | null = null;
	try {
		faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`;
	} catch {
		faviconUrl = null;
	}

	const content = (
		<Card className="flex flex-row items-center gap-4 px-6 py-4 shadow-sm">
			<div className="flex size-5 shrink-0 items-center justify-center">
				{faviconUrl && !faviconFailed ? (
					<img src={faviconUrl} alt="" className="size-5" onError={() => setFaviconFailed(true)} loading="eager" decoding="async" />
				) : (
					<IconComponent className="size-5 text-foreground" aria-hidden="true" />
				)}
			</div>
			<span className="font-medium text-foreground">{item.label}</span>
			{!isObsidian && <ExternalLink className="ml-auto size-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />}
		</Card>
	);

	return (
		<a
			href={item.url}
			target={isObsidian ? '_self' : '_blank'}
			rel={isObsidian ? 'noreferrer' : 'noreferrer noopener'}
			className="block no-underline"
		>
			{content}
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

export default function ShortcutPanel({ shortcutGroups, limit }: ShortcutPanelProps) {
	const [query, setQuery] = useState('');
	const allShortcuts = shortcutGroups.flatMap(group => group.shortcuts);
	const matchingShortcuts = allShortcuts.filter(shortcut => fuzzyMatch(`${shortcut.label} ${shortcut.url}`, query));
	const visibleShortcuts = matchingShortcuts.slice(0, limit);

	return (
		<section aria-label="Shortcuts" className="flex flex-col gap-6">
			<div className="grid gap-3">
				<h2 className="display-heading text-base leading-snug text-foreground">Shortcuts</h2>
				{allShortcuts.length > 0 && (
					<div className="relative">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
						<Input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search shortcuts" placeholder="Search shortcuts" className="h-8 pl-9 text-sm" />
					</div>
				)}
			</div>
			{allShortcuts.length === 0 ? (
				<p className="text-muted-foreground">No shortcuts configured</p>
			) : matchingShortcuts.length === 0 ? (
				<p className="text-muted-foreground">No matching shortcuts</p>
			) : (
				<div className="flex flex-col gap-3">
					{visibleShortcuts.map(shortcut => (
						<ShortcutCard key={shortcut.id} item={shortcut} />
					))}
					{matchingShortcuts.length > visibleShortcuts.length && <p className="text-xs text-muted-foreground">Showing {visibleShortcuts.length} of {matchingShortcuts.length}</p>}
				</div>
			)}
		</section>
	);
}
