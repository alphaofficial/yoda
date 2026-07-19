import type { Request, Response } from 'express';

export type SettingsSection = 'general' | 'github' | 'shortcuts' | 'backups';

export interface SettingsFeedback {
	type: 'success' | 'error';
	message: string;
}

type SettingsRequest = Request & {
	session: {
		settingsFeedback?: SettingsFeedback;
	};
};

export function consumeSettingsFeedback(req: Request): SettingsFeedback | null {
	const session = (req as SettingsRequest).session;
	const feedback = session.settingsFeedback ?? null;
	delete session.settingsFeedback;
	return feedback;
}

export function redirectToSettings(
	req: Request,
	res: Response,
	section: SettingsSection,
	feedback: SettingsFeedback,
) {
	(req as SettingsRequest).session.settingsFeedback = feedback;
	return res.redirect(303, `/settings?section=${section}`);
}
