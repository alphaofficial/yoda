import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { PageName } from '@/config/pages';
import variables from '@/config/variables';

interface SharedData {
	auth?: {
		user?: any;
	};
	flash?: {
		success?: string | null;
		error?: string | null;
	};
	[key: string]: any;
}

const templatePath = path.join(process.cwd(), 'public', 'template.html');
const ssrBundlePath = path.join(process.cwd(), 'dist', 'ssr.mjs');

const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

type SsrPayload = { head: string[]; body: string };
type SsrModule = { render: (page: unknown) => Promise<SsrPayload | void> };
const importSsrModule = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<SsrModule>;

async function loadSsrModule(): Promise<SsrModule> {
	const mtime = fs.statSync(ssrBundlePath).mtimeMs;
	const url = `${pathToFileURL(ssrBundlePath).href}?v=${mtime}`;
	return importSsrModule(url);
}

async function renderOnSsr(page: unknown): Promise<SsrPayload | null> {
	try {
		const mod = await loadSsrModule();
		const result = await mod.render(page);
		return result ?? null;
	} catch (err) {
		console.error('[SSR] render failed, falling back to client-only:', err);
		return null;
	}
}

export class InertiaExpressAdapter {
	private version: string;
	private sharedData: SharedData = {};

	constructor(options: { version: string }) {
		this.version = options.version;
	}

	share(key: string, value: any): void;
	share(data: SharedData): void;
	share(keyOrData: string | SharedData, value?: any): void {
		if (typeof keyOrData === 'string') {
			this.sharedData[keyOrData] = value;
		} else {
			this.sharedData = { ...this.sharedData, ...keyOrData };
		}
	}

	render(req: Request, res: Response, component: string, props: any = {}) {
		const finalProps = { ...this.sharedData, ...props };
		const isInertiaRequest = req.headers['x-inertia'] === 'true';

		if (isInertiaRequest) {
			const currentVersion = req.headers['x-inertia-version'] as string;

			if (currentVersion !== this.version) {
				return res.status(409).set('X-Inertia-Location', req.originalUrl).end();
			}

			const partialData = req.headers['x-inertia-partial-data'] as string;
			const partialComponent = req.headers['x-inertia-partial-component'] as string;

			let responseProps = finalProps;
			if (partialData && partialComponent === component) {
				const only = partialData.split(',').map(key => key.trim());
				responseProps = {};
				only.forEach(key => {
					if (key in finalProps) {
						responseProps[key] = finalProps[key];
					}
				});
			}

			return res.set({
				Vary: 'Accept',
				'X-Inertia': 'true',
			}).json({
				component,
				props: responseProps,
				url: req.originalUrl,
				version: this.version,
			});
		}

		return {
			component,
			props: finalProps,
			url: req.originalUrl,
			version: this.version,
		};
	}
}

export async function renderHtml(page: unknown, title?: string, head?: string): Promise<string> {
	const ssr = variables.DISABLE_SSR ? null : await renderOnSsr(page);

	const template = fs.readFileSync(templatePath, 'utf-8');
	const app = ssr
		? ssr.body
		: `<div id="app" data-page="${escapeHtml(JSON.stringify(page))}"></div>`;
	const headContent = [head || '', ssr ? ssr.head.join('\n') : ''].filter(Boolean).join('\n');

	return template
		.replace('{{TITLE}}', escapeHtml(title || variables.APP_NAME))
		.replace('{{HEAD}}', headContent)
		.replace('{{APP}}', () => app)
		.replace('{{CLIENT_ENTRY}}', '/app.js');
}

export async function renderPage(
	req: Request,
	res: Response,
	componentName: PageName,
	componentProps: any = {},
	documentMetadata: any = {},
) {
	const page = req.inertia.render(req, res, componentName, componentProps);

	if (res.headersSent) {
		return;
	}

	const html = await renderHtml(page, documentMetadata.title, documentMetadata.head);
	return res.send(html);
}
