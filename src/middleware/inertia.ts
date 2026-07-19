import { type Request, type Response, type NextFunction } from 'express';
import { InertiaExpressAdapter, renderHtml } from '@/primitives/inertia';
import variables from '@/config/variables';

declare module 'express-serve-static-core' {
	interface Request {
		inertia: InertiaExpressAdapter;
	}
}

export async function applyInertia(req: Request, res: Response, next: NextFunction) {
	const inertia = new InertiaExpressAdapter({ version: '1' });

	const user = await req.user();
	const isAuthenticated = req.is_authenticated();

	inertia.share({
		applicationName: variables.APP_NAME,
		isAuthenticated,
		user: user ? { id: user.id, name: user.name, email: user.email } : null,
	});

	req.inertia = inertia;

	res.render = ((view: string, props: Record<string, any> = {}) => {
		const { theme = 'light', ...pageProps } = props;
		const page = inertia.render(req, res, view, pageProps);

		if (res.headersSent) return;

		renderHtml(page, props._title, props._head, theme)
			.then(html => res.send(html))
			.catch(next);
	}) as any;

	next();
}
