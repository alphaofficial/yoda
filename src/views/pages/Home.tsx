import { Head, usePage } from '@inertiajs/react';
import CalendarPanel from '@/views/components/dashboard/CalendarPanel';
import GreetingHeader from '@/views/components/dashboard/GreetingHeader';
import IntegrationState from '@/views/components/dashboard/IntegrationState';
import PullRequestPanel from '@/views/components/dashboard/PullRequestPanel';
import ShortcutPanel from '@/views/components/dashboard/ShortcutPanel';
import type { DashboardResponse } from '@/types/dashboard';
import type { PageProps as InertiaPageProps } from '@inertiajs/core';

interface PageProps extends InertiaPageProps {
	applicationName: string;
	dashboard: DashboardResponse;
}

export default function Home() {
	const { props } = usePage<PageProps>();
	const { applicationName, dashboard } = props;

	return (
		<>
			<Head>
				<title>{applicationName} Dashboard</title>
			</Head>
			<div className="min-h-screen bg-background text-foreground antialiased">
				<main className="mx-auto max-w-[1440px] px-10 pt-8 pb-16 max-2xl:px-6 max-md:px-6">
					<GreetingHeader dashboard={dashboard} />

					<div className="grid grid-cols-12 gap-12 max-md:grid-cols-1 max-md:gap-8">
						<section
							className="col-span-8 max-md:col-span-1"
							aria-label="Dashboard content"
						>
							<IntegrationState
								integrations={dashboard.integrations}
								lastRefreshAt={dashboard.lastRefreshAt}
								stale={dashboard.stale}
							/>
							<div className="mt-16 max-md:mt-10">
								<PullRequestPanel pullRequests={dashboard.pullRequests} />
							</div>
						</section>
						<aside
							className="col-span-4 max-md:col-span-1"
							aria-label="Sidebar"
						>
							<ShortcutPanel
								shortcutGroups={dashboard.shortcutGroups}
							/>
							<div className="mt-8">
								<CalendarPanel
									calendar={dashboard.calendar}
									timeZone={dashboard.timeZone}
								/>
							</div>
						</aside>
					</div>
				</main>
			</div>
		</>
	);
}
