import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/views/components/ui/card';
import type { CalendarEventItem, DashboardResponse } from '@/types/dashboard';

interface CalendarPanelProps {
	calendar: DashboardResponse['calendar'];
	timeZone: string;
}

function formatEventTime(start: string, end: string, allDay: boolean, timeZone: string): string {
	if (allDay) {
		return 'All day';
	}

	const startDate = new Date(start);
	const endDate = new Date(end);

	const formatter = new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		timeZone,
	});

	return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
}

function CalendarEventRow({ item, timeZone }: { item: CalendarEventItem; timeZone: string }) {
	const timeDisplay = formatEventTime(item.start, item.end, item.allDay, timeZone);

	if (item.url) {
		return (
			<a
				href={item.url}
				target="_blank"
				rel="noreferrer noopener"
				className="flex items-center gap-3 px-7 py-6 no-underline transition-colors hover:bg-muted/50"
			>
				<span className="text-[15px]/[22px] font-normal text-muted-foreground">
					{timeDisplay}
				</span>
				<span className="min-w-0 flex-1 truncate text-[18px]/[28px] font-medium text-foreground">
					{item.title}
				</span>
				<ExternalLink
					className="size-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
			</a>
		);
	}

	return (
		<div className="flex items-center gap-3 px-7 py-6">
			<span className="text-[15px]/[22px] font-normal text-muted-foreground">
				{timeDisplay}
			</span>
			<span className="min-w-0 flex-1 truncate text-[18px]/[28px] font-medium text-foreground">
				{item.title}
			</span>
		</div>
	);
}

function EventSection({
	title,
	events,
	timeZone
}: {
	title: string;
	events: CalendarEventItem[];
	timeZone: string;
}) {
	return (
		<div>
			<h3 className="px-6 py-4 text-[28px]/[34px] font-bold text-foreground" style={{ letterSpacing: '-0.02em' }}>
				{title}
			</h3>
			{events.length === 0 ? (
				<div className="px-6 py-8 text-center text-[15px]/[22px] text-muted-foreground">
					No events
				</div>
			) : (
				<div>
					{events.map((event, index) => (
						<div
							key={`${event.calendarId}:${event.id}`}
							className="border-b border-border last:border-b-0"
						>
							<CalendarEventRow item={event} timeZone={timeZone} />
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export default function CalendarPanel({ calendar, timeZone }: CalendarPanelProps) {
	const { today, upcoming } = calendar;
	const isEmpty = today.length === 0 && upcoming.length === 0;

	return (
		<section aria-label="Calendar" className="flex flex-col gap-8">
			<Card
				className="rounded-[20px] border shadow-[0_1px_2px_rgb(0_0_0_/_0.035)]"
				style={{ '--card-spacing': '0' } as React.CSSProperties}
			>
				<CardHeader className="px-6 pt-6">
					<CardTitle className="text-[28px]/[34px] font-bold text-foreground" style={{ letterSpacing: '-0.02em' }}>
						Calendar
					</CardTitle>
				</CardHeader>
				<CardContent className="px-0 pb-0">
					{isEmpty ? (
						<div className="flex flex-col items-center justify-center py-12 text-[15px]/[22px] text-muted-foreground">
							<p>No upcoming events</p>
						</div>
					) : (
						<div className="flex flex-col">
							<EventSection title="Today" events={today} timeZone={timeZone} />
							{today.length > 0 && upcoming.length > 0 && (
								<div className="border-b border-border" />
							)}
							<EventSection title="Upcoming" events={upcoming} timeZone={timeZone} />
						</div>
					)}
				</CardContent>
			</Card>
		</section>
	);
}
