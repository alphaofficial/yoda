import { PinoLogger } from '@/logger/pinoLogger';
import type { MailMessage, MailTransport } from '@/primitives/mail';

/** Log a mail message instead of sending it. */
const sendMail = async (message: MailMessage): Promise<void> => {
	PinoLogger.info({
		scope: 'sendMail',
		message: 'Sending email',
		to: message.to,
		subject: message.subject
	});
};

export function createLogMailDriver(): MailTransport {
	return {
		sendMail,
	};
}
