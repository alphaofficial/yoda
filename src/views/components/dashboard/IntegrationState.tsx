import { Badge } from '@/views/components/ui/badge';
import type { DashboardResponse } from '@/types/dashboard';

interface IntegrationStateProps {
	integrations: DashboardResponse['integrations'];
	lastRefreshAt: string | null;
	stale: boolean;
}

function formatLastRefresh(isoString: string | null): string {
	if (!isoString) return 'Never';
	const date = new Date(isoString);
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	}).format(date);
}

function IntegrationBadge({
	state,
	provider,
	message,
}: {
	state: DashboardResponse['integrations'][keyof DashboardResponse['integrations']]['state'];
	provider: string;
	message: string | null;
}) {
	let variant: 'secondary' | 'default' | 'destructive' = 'secondary';
	let label = provider;

	switch (state) {
		case 'ok':
			variant = 'default';
			label = `${provider} OK`;
			break;
		case 'error':
			variant = 'destructive';
			label = `${provider} Error`;
			break;
		case 'unconfigured':
			variant = 'secondary';
			label = `${provider} Unconfigured`;
			break;
	}

	return (
		<Badge variant={variant} aria-label={`${label}${message ? `: ${message}` : ''}`}>
			{label}
		</Badge>
	);
}

export default function IntegrationState({
	integrations,
	lastRefreshAt,
	stale,
}: IntegrationStateProps) {
	return (
		<section aria-label="Integration status" aria-live="polite">
			{stale && (
				<div
					className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
					role="alert"
				>
					Warning: Some data may be outdated. A background refresh is in progress.
				</div>
			)}
			<div className="flex flex-wrap items-center gap-3">
				<span className="text-sm text-muted-foreground">
					Last refresh: {formatLastRefresh(lastRefreshAt)}
				</span>
				<span className="text-muted-foreground" aria-hidden="true">
					·
				</span>
				<IntegrationBadge
					state={integrations.github.state}
					provider="GitHub"
					message={integrations.github.message}
				/>
				<IntegrationBadge
					state={integrations.calendar.state}
					provider="Calendar"
					message={integrations.calendar.message}
				/>
			</div>
		</section>
	);
}
