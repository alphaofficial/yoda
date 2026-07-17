import { Request, Response } from 'express';

/**
 * Render the public home page.
 */
export async function index(req: Request, res: Response) {
	return res.render('Home', {
		timestamp: new Date().toISOString(),
	});
}
