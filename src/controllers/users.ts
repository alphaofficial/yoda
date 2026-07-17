import { Request, Response } from 'express';

interface User {
	id: number;
	name: string;
	email: string;
}

const userDirectory: User[] = [
	{ id: 1, name: 'Alice Johnson', email: 'alice@example.com' },
	{ id: 2, name: 'Bob Smith', email: 'bob@example.com' },
	{ id: 3, name: 'Charlie Brown', email: 'charlie@example.com' }
];

/**
 * Render the static user directory page.
 */
export async function index(req: Request, res: Response) {
	return res.render('Users', { users: userDirectory });
}

/**
 * Render a single user page from the static directory.
 */
export async function show(req: Request, res: Response) {
	const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const user = userDirectory.find((entry: User) => entry.id === parseInt(id, 10));

	if (!user) {
		return res.status(404).json({ error: 'User not found' });
	}

	return res.render('User', { user });
}
