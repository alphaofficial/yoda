import variables from '@/config/variables';
import { PinoLogger } from '@/logger/pinoLogger';
import { WelcomeEmail } from '@/mail/templates/WelcomeEmail';
import { Mailer } from '@/primitives/mail';

export interface SendWelcomeEmailPayload {
	to: string;
	name: string;
}

export async function sendWelcomeEmail(payload: SendWelcomeEmailPayload): Promise<void> {
	await Mailer.send(
		payload.to,
		`Welcome to ${variables.APP_NAME}`,
		WelcomeEmail({
			name: payload.name,
			appName: variables.APP_NAME,
		}),
	);

	PinoLogger.info({
		scope: 'sendWelcomeEmail',
		message: 'Sending welcome email',
		to: payload.to,
		name: payload.name,
	});
}
