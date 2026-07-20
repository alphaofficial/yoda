import { useState } from 'react';
import { ExternalLink, Globe2, Search } from 'lucide-react';
import { Card } from '@/views/components/ui/card';
import { Input } from '@/views/components/ui/input';
import type { DashboardResponse, ShortcutItem } from '@/types/dashboard';

interface ShortcutPanelProps {
	shortcutGroups: DashboardResponse['shortcutGroups'];
	limit: number;
}

function ShortcutCard({ item }: { item: ShortcutItem }) {
	let faviconUrl: string | null = null;
	let fallbackFaviconUrl: string | null = null;
	try {
		const url = new URL(item.url);
		if (url.protocol === 'http:' || url.protocol === 'https:') {
			faviconUrl = `${url.origin}/favicon.ico`;
			fallbackFaviconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
		}
	} catch {
		faviconUrl = null;
	}

	const content = (
		<Card className="flex flex-row items-center gap-3 px-4 py-4 shadow-sm transition-colors group-hover:bg-muted group-focus-visible:bg-muted sm:gap-4 sm:px-6">
			<div className="relative flex size-5 shrink-0 items-center justify-center">
				<Globe2 className="size-5 text-muted-foreground" aria-hidden="true" />
				{faviconUrl && (
					<img
						src={faviconUrl}
						alt=""
						className="absolute inset-0 size-5 rounded-md bg-background"
						onError={event => {
							if (fallbackFaviconUrl && event.currentTarget.dataset.fallback !== 'google') {
								event.currentTarget.dataset.fallback = 'google';
								event.currentTarget.src = fallbackFaviconUrl;
								return;
							}
							event.currentTarget.hidden = true;
						}}
						loading="eager"
						decoding="async"
					/>
				)}
			</div>
			<span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.label}</span>
			<ExternalLink className="size-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />
		</Card>
	);

	return (
		<a
			href={item.url}
			target="_blank"
			rel="noreferrer noopener"
			className="group block rounded-lg no-underline outline-none"
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
		<section aria-label="Quick links" className="flex flex-col gap-6">
			<div className="grid gap-3">
				<h2 className="display-heading text-base leading-snug text-foreground">Quick links</h2>
				{allShortcuts.length > 0 && (
					<div className="relative">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
						<Input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search quick links" placeholder="Search quick links" className="h-8 pl-9 text-sm" />
					</div>
				)}
			</div>
			{allShortcuts.length === 0 ? (
				<p className="text-muted-foreground">No quick links configured</p>
			) : matchingShortcuts.length === 0 ? (
				<p className="text-muted-foreground">No matching quick links</p>
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
