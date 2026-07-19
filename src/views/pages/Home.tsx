import { Head, usePage } from '@inertiajs/react';
import GreetingHeader from '@/views/components/dashboard/GreetingHeader';
import PullRequestPanel from '@/views/components/dashboard/PullRequestPanel';
import ShortcutPanel from '@/views/components/dashboard/ShortcutPanel';
import type { DashboardResponse } from '@/types/dashboard';
import type { PageProps as InertiaPageProps } from '@inertiajs/core';

interface PageProps extends InertiaPageProps {
	applicationName: string;
	dashboard: DashboardResponse;
	pullRequestFilterState: string | null;
}

export default function Home() {
	const { props } = usePage<PageProps>();
	const { applicationName, dashboard, pullRequestFilterState } = props;

	return (
		<>
			<Head title={`${applicationName} Dashboard`} />
			<div className="min-h-screen bg-background text-foreground antialiased">
				<main className="dashboard-shell">
					<GreetingHeader dashboard={dashboard} />

					<div className="dashboard-grid">
						<section
							className="dashboard-main"
							aria-label="Dashboard content"
						>
							<PullRequestPanel pullRequests={dashboard.pullRequests} persistedFilterState={pullRequestFilterState} />
						</section>
						<aside
							className="dashboard-sidebar"
							aria-label="Sidebar"
						>
							<ShortcutPanel
								shortcutGroups={dashboard.shortcutGroups}
								limit={dashboard.shortcutLimit ?? 8}
							/>
						</aside>
					</div>
				</main>
			</div>
		</>
	);
}
