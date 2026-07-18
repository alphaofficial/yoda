import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/views/components/ui/button';
import type { DashboardResponse } from '@/types/dashboard';

interface GreetingHeaderProps {
	dashboard: DashboardResponse;
}

function getGreeting(hour: number): 'morning' | 'afternoon' | 'evening' {
	if (hour >= 5 && hour < 12) return 'morning';
	if (hour >= 12 && hour < 17) return 'afternoon';
	return 'evening';
}

function formatDate(isoString: string, timeZone: string): string {
	const date = new Date(isoString);
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone,
	}).format(date);
}

function getHour(date: Date, timeZone: string): number {
	const hour = new Intl.DateTimeFormat('en-GB', {
		hour: '2-digit',
		hourCycle: 'h23',
		timeZone,
	}).formatToParts(date).find(part => part.type === 'hour')?.value;
	return Number(hour ?? 0);
}

function formatTime(date: Date, timeZone: string, timeFormat: '12' | '24'): string {
	return new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hourCycle: timeFormat === '12' ? 'h12' : 'h23',
		timeZone,
	}).format(date);
}

export default function GreetingHeader({ dashboard }: GreetingHeaderProps) {
	const [time, setTime] = useState<Date>(() => new Date(dashboard.generatedAt));

	useEffect(() => {
		const interval = setInterval(() => {
			setTime(new Date());
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	const timeFormat = dashboard.timeFormat ?? '12';
	const greeting = getGreeting(getHour(time, dashboard.timeZone));
	const greetingText = `Good ${greeting}, ${dashboard.displayName}`;
	const dateStr = formatDate(dashboard.generatedAt, dashboard.timeZone);
	const timeStr = formatTime(time, dashboard.timeZone, timeFormat);

	return (
		<header className="mb-10 max-md:mb-10">
			<div className="mb-4 flex items-center justify-between">
				<p className="font-normal text-muted-foreground">
					{dateStr}
				</p>
				<div className="flex items-center gap-3">
					<p className="font-normal tabular-nums text-muted-foreground">
						{timeStr}
					</p>
					<Button
						variant="ghost"
						size="icon"
						className="shrink-0"
						aria-label="Settings"
						render={<a href="/settings" />}
					>
						<Settings aria-hidden="true" />
					</Button>
				</div>
			</div>
			<div>
				<h1 className="display-heading page-heading text-foreground">
					{greetingText}
				</h1>
			</div>
		</header>
	);
}
