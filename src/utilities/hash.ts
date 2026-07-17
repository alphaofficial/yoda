import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export const hash = {
	make(value: string): Promise<string> {
		return bcrypt.hash(value, SALT_ROUNDS);
	},

	check(value: string, hashedValue: string): Promise<boolean> {
		return bcrypt.compare(value, hashedValue);
	},
};
