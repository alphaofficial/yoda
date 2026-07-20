export function timeAgo(isoString: string, relativeTo = new Date()): string {
	const date = new Date(isoString);
	const diffSeconds = Math.max(0, Math.round((relativeTo.getTime() - date.getTime()) / 1000));

	if (diffSeconds < 5) return 'now';
	if (diffSeconds < 60) return `${diffSeconds} seconds ago`;
	if (diffSeconds < 90) return 'about a minute ago';

	const diffMinutes = Math.round(diffSeconds / 60);
	if (diffMinutes < 60) return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;

	const diffHours = Math.round(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;

	const diffDays = Math.floor(diffHours / 24);
	if (diffDays === 1) return '1 day ago';
	if (diffDays < 7) return `${diffDays} days ago`;
	if (diffDays < 14) return '1 week ago';

	const weeks = Math.floor(diffDays / 7);
	return `${weeks} weeks ago`;
}
