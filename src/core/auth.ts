import { EntityManager } from '@mikro-orm/core';
import crypto from 'crypto';
import variables from '@/config/variables';
import { User } from '@/models/User';
import { PasswordReset } from '@/models/PasswordReset';
import { Session } from '@/models/Session';
import { hash } from '@/utilities/hash';
import { Mailer } from '@/primitives/mail';
import { Bus } from '@/primitives/bus';
import { Queue } from '@/primitives/queue';
import { AppContext } from '@/runtime/context';

export type AuthErrors = Record<string, string[]>;
type AuthResult<T> = { data: T; errors: null } | { data: null; errors: AuthErrors };

interface VerificationPayload {
	id: string;
	email: string;
	iat: number;
}

 function readString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function isEmail(value: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hasErrors(errors: AuthErrors) {
	return Object.keys(errors).length > 0;
}

function readLogin(body: unknown) {
	const data = body as Record<string, unknown>;
	const email = readString(data?.email);
	const password = readString(data?.password);
	const errors: AuthErrors = {};

	if (!isEmail(email)) {
		errors.email = ['Invalid email address'];
	}

	if (!password) {
		errors.password = ['Password is required'];
	}

	return { email, password, errors };
}

function readRegister(body: unknown) {
	const data = body as Record<string, unknown>;
	const name = readString(data?.name);
	const email = readString(data?.email);
	const password = readString(data?.password);
	const passwordConfirmation = readString(data?.password_confirmation);
	const errors: AuthErrors = {};

	if (!name) {
		errors.name = ['Name is required'];
	}

	if (!isEmail(email)) {
		errors.email = ['Invalid email address'];
	}

	if (password.length < 8) {
		errors.password = ['Password must be at least 8 characters'];
	}

	if (passwordConfirmation.length < 8) {
		errors.password_confirmation = ['Password confirmation must be at least 8 characters'];
	} else if (password !== passwordConfirmation) {
		errors.password_confirmation = ["Passwords don't match"];
	}

	return { name, email, password, errors };
}

function readForgotPassword(body: unknown) {
	const data = body as Record<string, unknown>;
	const email = readString(data?.email);
	const errors: AuthErrors = {};

	if (!isEmail(email)) {
		errors.email = ['Invalid email address'];
	}

	return { email, errors };
}

function readResetPassword(body: unknown) {
	const data = body as Record<string, unknown>;
	const token = readString(data?.token);
	const email = readString(data?.email);
	const password = readString(data?.password);
	const passwordConfirmation = readString(data?.password_confirmation);
	const errors: AuthErrors = {};

	if (!token) {
		errors.token = ['Token is required'];
	}

	if (!isEmail(email)) {
		errors.email = ['Invalid email address'];
	}

	if (password.length < 8) {
		errors.password = ['Password must be at least 8 characters'];
	}

	if (passwordConfirmation.length < 8) {
		errors.password_confirmation = ['Password confirmation must be at least 8 characters'];
	} else if (password !== passwordConfirmation) {
		errors.password_confirmation = ["Passwords don't match"];
	}

	return { token, email, password, errors };
}

function readVerificationToken(token: string):
	AuthResult<{ payload: VerificationPayload }> {
	const payload = verifyVerificationToken(token);

	if (!payload) {
		return { data: null, errors: { email: ['This verification link is invalid.'] } };
	}

	const expiryMs = variables.EMAIL_VERIFICATION_EXPIRY * 60 * 1000;
	if (Date.now() - payload.iat > expiryMs) {
		return { data: null, errors: { email: ['This verification link has expired. Please request a new one.'] } };
	}

	return { data: { payload }, errors: null };
}

export function makeVerificationToken(userId: string, email: string): string {
	const payload = Buffer.from(JSON.stringify({ id: userId, email, iat: Date.now() })).toString('base64url');
	const sig = crypto.createHmac('sha256', variables.APP_KEY).update(payload).digest('hex');
	return `${payload}.${sig}`;
}

/**
 * Verify the signature and payload shape of an email verification token.
 */
export function verifyVerificationToken(token: string): VerificationPayload | null {
	const dot = token.lastIndexOf('.');
	if (dot < 0) return null;

	const payload = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	const expected = crypto.createHmac('sha256', variables.APP_KEY).update(payload).digest('hex');
	const sigBuf = Buffer.from(sig, 'hex');
	const expBuf = Buffer.from(expected, 'hex');

	if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
		return null;
	}

	try {
		return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as VerificationPayload;
	} catch {
		return null;
	}
}

/**
 * Authenticate a user by email and password.
 */
export async function loginUser(database: EntityManager, email: string, password: string): Promise<User | null> {
	const user = await database.findOne(User, { email });
	if (!user) {
		return null;
	}

	if (!(await hash.check(password, user.password))) {
		return null;
	}

	Bus.publish('auth.loggedIn', { id: user.id, email: user.email });
	return user;
}

/**
 * Send a signed email verification link to a user.
 */
export async function sendVerificationEmail(
	user: Pick<User, 'id' | 'email'>,
	introHtml: string,
): Promise<void> {
	const token = makeVerificationToken(user.id, user.email);
	const verifyUrl = `${variables.APP_URL}/verify-email/${token}`;
	const html = `
        ${introHtml}
        <p><a href="${verifyUrl}">Click here to verify your email address</a></p>
        <p>If you did not create an account, please ignore this email.</p>
    `;

	await Mailer.send(user.email, 'Verify your email address', html);
}

/**
 * Create a new user account unless the email address is already taken.
 */
export async function registerUser(
	database: EntityManager,
	name: string,
	email: string,
	password: string,
): Promise<AuthResult<{ user: User }>> {
	const existingUser = await database.findOne(User, { email });
	if (existingUser) {
		return { data: null, errors: { email: ['Email already taken'] } };
	}

	const hashedPassword = await hash.make(password);
	const user = new User(crypto.randomUUID(), name, email, hashedPassword);

	await database.persistAndFlush(user);
	Bus.publish('auth.registered', { id: user.id, email: user.email });
	return { data: { user }, errors: null };
}

/**
 * Create and email a password reset link for a user if they exist.
 */
export async function requestPasswordReset(database: EntityManager, email: string): Promise<void> {
	const user = await database.findOne(User, { email });
	if (!user) {
		return;
	}

	const rawToken = crypto.randomBytes(32).toString('hex');
	const tokenHash = crypto.createHmac('sha256', variables.APP_KEY).update(rawToken).digest('hex');

	await database.nativeDelete(PasswordReset, { email });
	const reset = database.create(PasswordReset, { email, tokenHash, createdAt: new Date() });
	await database.persistAndFlush(reset);

	const resetUrl = `${variables.APP_URL}/reset-password/${rawToken}?email=${encodeURIComponent(email)}`;
	const html = `
        <p>You requested a password reset for your account.</p>
        <p><a href="${resetUrl}">Click here to reset your password</a></p>
        <p>This link expires in ${variables.PASSWORD_RESET_EXPIRY} minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
    `;

	await Mailer.send(email, 'Password Reset Request', html);
}

/**
 * Replace a user's password from a valid password reset token.
 */
export async function resetUserPassword(
	database: EntityManager,
	token: string,
	email: string,
	password: string,
): Promise<AuthResult<Record<string, never>>> {
	const tokenHash = crypto.createHmac('sha256', variables.APP_KEY).update(token).digest('hex');
	const reset = await database.findOne(PasswordReset, { email, tokenHash });

	if (!reset) {
		return { data: null, errors: { token: ['This password reset link is invalid.'] } };
	}

	const expiryMs = variables.PASSWORD_RESET_EXPIRY * 60 * 1000;
	if (Date.now() - reset.createdAt.getTime() > expiryMs) {
		await database.nativeDelete(PasswordReset, { email });
		return { data: null, errors: { token: ['This password reset link has expired. Please request a new one.'] } };
	}

	const user = await database.findOne(User, { email });
	if (!user) {
		return { data: null, errors: { token: ['This password reset link is invalid.'] } };
	}

	user.password = await hash.make(password);
	await database.nativeDelete(PasswordReset, { email });
	await database.nativeDelete(Session, { user_id: user.id });
	await database.flush();

	return { data: {}, errors: null };
}

/**
 * Mark a user's email as verified from a trusted verification payload.
 */
export async function verifyUserEmail(
	database: EntityManager,
	payload: VerificationPayload,
): Promise<AuthResult<{ user: User }>> {
	const user = await database.findOne(User, { id: payload.id, email: payload.email });
	if (!user) {
		return { data: null, errors: { email: ['This verification link is invalid.'] } };
	}

	if (!user.emailVerifiedAt) {
		user.emailVerifiedAt = new Date();
		await database.flush();
		Bus.publish('auth.verified', { id: user.id, email: user.email });
	}

	return { data: { user }, errors: null };
}

/**
 * Parse login input, validate it, and authenticate the matching user.
 */
export async function attemptLogin(database: EntityManager, body: unknown) {
	const { email, password, errors } = readLogin(body);

	if (hasErrors(errors)) {
		return { data: null, errors };
	}

	const user = await loginUser(database, email, password);
	if (!user) {
		return { data: null, errors: { email: ['Invalid credentials'] } };
	}

	return { data: { user }, errors: null };
}

/**
 * Parse registration input, create the user, and trigger welcome flows.
 */
export async function attemptRegister(database: EntityManager, body: unknown) {
	const { name, email, password, errors } = readRegister(body);

	if (hasErrors(errors)) {
		return { data: null, errors };
	}

	const result = await registerUser(database, name, email, password);
	if (result.errors) {
		return result;
	}

	await sendVerificationEmail(result.data.user, `<p>Welcome to ${variables.APP_NAME}!</p>`);
	await Queue.dispatch('sendWelcomeEmail', {
		to: result.data.user.email,
		name: result.data.user.name,
	});
	return result;
}

/**
 * Parse forgot-password input and request a reset link when valid.
 */
export async function attemptForgotPassword(database: EntityManager, body: unknown) {
	const { email, errors } = readForgotPassword(body);

	if (hasErrors(errors)) {
		return { data: null, errors };
	}

	await requestPasswordReset(database, email);
	return { data: { status: 'We have emailed your password reset link!' }, errors: null };
}

/**
 * Parse reset-password input and attempt to replace the user's password.
 */
export async function attemptResetPassword(database: EntityManager, body: unknown) {
	const { token, email, password, errors } = readResetPassword(body);

	if (hasErrors(errors)) {
		return { data: null, errors };
	}

	return resetUserPassword(database, token, email, password);
}

/**
 * Validate and consume an email verification token.
 */
export async function attemptVerifyEmail(database: EntityManager, token: string) {
	const verification = readVerificationToken(token);

	if (verification.errors) {
		return verification;
	}

	return verifyUserEmail(database, verification.data.payload);
}

/**
 * Send a new verification email unless the user is already verified.
 */
export async function resendVerification(user: Pick<User, 'id' | 'email' | 'emailVerifiedAt'>) {
	if (user.emailVerifiedAt) {
		return { data: { status: 'Your email is already verified.' }, errors: null };
	}

	await sendVerificationEmail(user, '<p>Please verify your email address.</p>');
	return { data: { status: 'A new verification link has been sent to your email address.' }, errors: null };
}


/** Event handler for AuthRegistered */
export function onAuthRegistered<T>(ctx: AppContext, payload: T) {
	// Handle auth registered event
	ctx.logger.info({ scope: 'onAuthRegistered', message: 'User registered', payload });
};
