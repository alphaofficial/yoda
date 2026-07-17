import nodemailer from 'nodemailer';
import variables from '@/config/variables';
import type { MailMessage, MailTransport } from '@/primitives/mail';

interface SmtpMailState {
	transporter: nodemailer.Transporter | null;
}

const getTransporter = (state: SmtpMailState): nodemailer.Transporter => {
	if (state.transporter) {
		return state.transporter;
	}

	if (!process.env.MAIL_HOST) {
		throw new Error('SMTP driver requires MAIL_HOST to be configured');
	}

	state.transporter = nodemailer.createTransport({
		host: process.env.MAIL_HOST,
		port: Number(process.env.MAIL_PORT ?? 587),
		auth: {
			user: process.env.MAIL_USER,
			pass: process.env.MAIL_PASS,
		},
	});

	return state.transporter;
};

/** Send a mail message via SMTP. */
const sendMail = async (state: SmtpMailState, message: MailMessage): Promise<void> => {
	await getTransporter(state).sendMail({
		from: variables.MAIL_FROM,
		to: message.to,
		subject: message.subject,
		html: message.html,
	});
};

export function createSmtpMailDriver(): MailTransport {
	const state: SmtpMailState = { transporter: null };

	return {
		sendMail: (message: MailMessage) => sendMail(state, message),
	};
}
