import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
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

function formatTime(date: Date): string {
	return new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
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

	const greeting = getGreeting(time.getHours());
	const greetingText = `Good ${greeting}, ${dashboard.displayName}`;
	const dateStr = formatDate(dashboard.generatedAt, dashboard.timeZone);
	const timeStr = formatTime(time);

	return (
		<>
			<div className="flex items-center justify-end mb-20 max-md:mb-12">
				<div className="flex items-center gap-3">
					<p className="text-[18px]/[28px] font-normal text-muted-foreground">
						{timeStr}
					</p>
					<button
						type="button"
						className="flex size-11 items-center justify-center rounded-md bg-transparent text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						aria-label="Settings"
					>
						<Settings className="size-5" aria-hidden="true" />
					</button>
				</div>
			</div>
			<div className="flex flex-col gap-2 mb-16 max-md:mb-10">
				<p className="text-[18px]/[28px] font-normal text-muted-foreground">
					{dateStr}
				</p>
				<h1
					className="text-[48px]/[52px] font-bold text-foreground max-sm:text-[36px]/[40px]"
					style={{ letterSpacing: '-0.035em' }}
				>
					{greetingText}
				</h1>
			</div>
		</>
	);
}
