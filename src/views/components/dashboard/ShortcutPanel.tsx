import { useState, useRef } from 'react';
import { ExternalLink, CalendarDays, GitPullRequest, Columns3, Link, Gem, Plus } from 'lucide-react';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/views/components/ui/dialog';
import { Button } from '@/views/components/ui/button';
import { Input } from '@/views/components/ui/input';
import { Label } from '@/views/components/ui/label';
import type { DashboardResponse, ShortcutGroup, ShortcutIcon, ShortcutItem } from '@/types/dashboard';

interface ShortcutPanelProps {
	shortcutGroups: DashboardResponse['shortcutGroups'];
}

const ICON_MAP: Record<ShortcutIcon, typeof CalendarDays> = {
	calendar: CalendarDays,
	github: GitPullRequest,
	jira: Columns3,
	link: Link,
	obsidian: Gem,
};

const VALID_ICONS: ShortcutIcon[] = ['calendar', 'github', 'jira', 'link', 'obsidian'];

function ShortcutCard({ item }: { item: ShortcutItem }) {
	const IconComponent = ICON_MAP[item.icon];
	const isObsidian = item.icon === 'obsidian';

	const cardContent = (
		<div className="flex min-h-[76px] items-center gap-4 rounded-[20px] border border-border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0_/_0.035)]">
			<div className="flex size-10 items-center justify-center rounded-[10px] bg-muted">
				<IconComponent className="size-5 text-foreground" aria-hidden="true" />
			</div>
			<span className="text-[18px]/[28px] font-medium text-foreground">
				{item.label}
			</span>
			{!isObsidian && (
				<ExternalLink
					className="ml-auto size-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
			)}
		</div>
	);

	if (isObsidian) {
		return (
			<a
				href={item.url}
				className="block no-underline"
				target="_self"
				rel="noreferrer"
			>
				{cardContent}
			</a>
		);
	}

	return (
		<a
			href={item.url}
			target="_blank"
			rel="noreferrer noopener"
			className="block no-underline"
		>
			{cardContent}
		</a>
	);
}

function AddShortcutDialog({
	groups,
	onSuccess,
}: {
	groups: ShortcutGroup[];
	onSuccess: (shortcut: ShortcutItem, groupId: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
	const [label, setLabel] = useState('');
	const [url, setUrl] = useState('');
	const [icon, setIcon] = useState<ShortcutIcon>('link');
	const [position, setPosition] = useState('');

	const groupIdRef = useRef(groupId);

	const resetForm = () => {
		setGroupId(groups[0]?.id ?? '');
		setLabel('');
		setUrl('');
		setIcon('link');
		setPosition('');
		setErrors({});
	};

	const handleClose = () => {
		setOpen(false);
		resetForm();
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		setErrors({});
		groupIdRef.current = groupId;

		const payload: {
			groupId: string;
			label: string;
			url: string;
			icon: ShortcutIcon;
			position?: number;
		} = {
			groupId,
			label,
			url,
			icon,
		};

		if (position) {
			const pos = parseInt(position, 10);
			if (!isNaN(pos)) {
				payload.position = pos;
			}
		}

		try {
			const response = await fetch('/api/shortcuts', {
				method: 'POST',
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});

			const data = await response.json();

			if (!response.ok) {
				if (response.status === 422 && data.fields) {
					setErrors(data.fields);
				}
				return;
			}

			onSuccess(data.shortcut, groupIdRef.current);
			handleClose();
		} catch {
			setErrors({ general: 'Failed to add shortcut. Please try again.' });
		} finally {
			setSaving(false);
		}
	};

	if (groups.length === 0) {
		return (
			<Button disabled variant="secondary" size="sm" aria-label="Add shortcut - no groups configured">
				<Plus className="size-4" aria-hidden="true" />
				Add
			</Button>
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="secondary"
					size="sm"
					className="h-11 gap-2 rounded-full px-5"
					aria-label="Add shortcut"
				>
					<Plus className="size-4" aria-hidden="true" />
					Add
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Shortcut</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="shortcut-group">Group</Label>
						<select
							id="shortcut-group"
							value={groupId}
							onChange={e => setGroupId(e.target.value)}
							className="h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
							required
						>
							{groups.map(group => (
								<option key={group.id} value={group.id}>
									{group.label}
								</option>
							))}
						</select>
						{errors.groupId && (
							<p className="text-sm text-destructive">{errors.groupId}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="shortcut-label">Label</Label>
						<Input
							id="shortcut-label"
							type="text"
							value={label}
							onChange={e => setLabel(e.target.value)}
							placeholder="My shortcut"
							maxLength={60}
							aria-invalid={!!errors.label}
							required
						/>
						{errors.label && (
							<p className="text-sm text-destructive">{errors.label}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="shortcut-url">URL</Label>
						<Input
							id="shortcut-url"
							type="text"
							value={url}
							onChange={e => setUrl(e.target.value)}
							placeholder="https://example.com"
							aria-invalid={!!errors.url}
							required
						/>
						{errors.url && (
							<p className="text-sm text-destructive">{errors.url}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="shortcut-icon">Icon</Label>
						<select
							id="shortcut-icon"
							value={icon}
							onChange={e => setIcon(e.target.value as ShortcutIcon)}
							className="h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
						>
							{VALID_ICONS.map(iconName => (
								<option key={iconName} value={iconName}>
									{iconName.charAt(0).toUpperCase() + iconName.slice(1)}
								</option>
							))}
						</select>
						{errors.icon && (
							<p className="text-sm text-destructive">{errors.icon}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="shortcut-position">Position (optional)</Label>
						<Input
							id="shortcut-position"
							type="number"
							value={position}
							onChange={e => setPosition(e.target.value)}
							placeholder="End of list"
							min={1}
							className="w-32"
						/>
						<p className="text-sm text-muted-foreground">
							One-based position. Empty places at the end.
						</p>
						{errors.position && (
							<p className="text-sm text-destructive">{errors.position}</p>
						)}
					</div>

					{errors.general && (
						<p className="text-sm text-destructive" role="alert">
							{errors.general}
						</p>
					)}

					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={handleClose}
							disabled={saving}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? 'Adding...' : 'Add'}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export default function ShortcutPanel({ shortcutGroups }: ShortcutPanelProps) {
	const [localGroups, setLocalGroups] = useState(shortcutGroups);

	const handleShortcutAdded = (shortcut: ShortcutItem, targetGroupId: string) => {
		setLocalGroups(prevGroups => {
			return prevGroups.map(group => {
				if (group.id !== targetGroupId) {
					return group;
				}
				const newShortcut: ShortcutItem = {
					id: shortcut.id,
					label: shortcut.label,
					url: shortcut.url,
					icon: shortcut.icon,
				};
				return {
					...group,
					shortcuts: [...group.shortcuts, newShortcut],
				};
			});
		});
	};

	return (
		<section aria-label="Shortcuts" className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<h2
					className="text-[28px]/[34px] font-bold text-foreground"
					style={{ letterSpacing: '-0.02em' }}
				>
					Shortcuts
				</h2>
				<AddShortcutDialog groups={localGroups} onSuccess={handleShortcutAdded} />
			</div>

			{localGroups.length === 0 ? (
				<p className="text-[15px]/[22px] text-muted-foreground">
					No shortcut groups configured
				</p>
			) : (
				<div className="flex flex-col gap-3">
					{localGroups.map(group => (
						<div key={group.id} className="flex flex-col gap-3">
							<h3 className="text-sm font-medium text-muted-foreground">
								{group.label}
							</h3>
							<div className="flex flex-col gap-3">
								{group.shortcuts.map(shortcut => (
									<ShortcutCard key={shortcut.id} item={shortcut} />
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	);
}
