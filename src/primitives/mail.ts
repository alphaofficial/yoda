import { getPrimitiveRuntime, hasPrimitiveRuntime, registerPrimitiveRuntime } from '@/runtime/primitiveRegistry';

export interface MailMessage {
	to: string;
	subject: string;
	html: string;
}

export interface MailTransport {
	sendMail(message: MailMessage): Promise<void>;
}

interface MailRuntime {
	driver: MailTransport;
}

/** Configure the mail transport. */
const configure = (driver: MailTransport): void => {
	if (hasPrimitiveRuntime('mail')) {
		return;
	}

	registerPrimitiveRuntime<MailRuntime>('mail', {
		driver,
	});
};

/** Send an email message. */
const send = async (to: string, subject: string, html: string): Promise<void> => {
	await getPrimitiveRuntime<MailRuntime>('mail').driver.sendMail({ to, subject, html });
};

/**
 * Mail primitive for selecting a transport and sending outbound mail.
 */
export const Mailer = Object.freeze({
	configure,
	send,
});
