import { Request, Response } from 'express';

/**
 * Render the about page.
 */
export async function index(req: Request, res: Response) {
	return res.render('About', {
		title: 'About Us',
		description: 'This is an Inertia.js app running on Express with React.',
	});
}
