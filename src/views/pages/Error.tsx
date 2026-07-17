import { Head, Link } from '@inertiajs/react';

interface Props {
	status?: number;
	message?: string;
	stack?: string;
}

const titles: Record<number, string> = {
	404: 'Page not found',
	500: 'Server error',
};

export default function ErrorPage({ status = 500, message, stack }: Props) {
	const title = titles[status] || 'Something went wrong';
	const isDev = Boolean(stack);
	return (
		<>
			<Head title={`${status} — ${title}`} />
			<div className="min-h-screen bg-white flex items-center justify-center px-6 py-12">
				<div className={isDev ? 'w-full max-w-3xl' : 'text-center max-w-md'}>
					<p className="text-sm font-semibold text-gray-500">{status}</p>
					<h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
						{title}
					</h1>
					{isDev ? (
						<div className="mt-6 overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e] text-left shadow-xl">
							<div className="flex items-center gap-1.5 border-b border-gray-800 bg-[#2d2d2d] px-4 py-2.5">
								<span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
								<span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
								<span className="h-3 w-3 rounded-full bg-[#27c93f]" />
								<span className="ml-3 text-xs text-gray-400 font-mono">error</span>
							</div>
							<pre className="whitespace-pre-wrap break-words p-4 text-sm leading-relaxed font-mono text-gray-100">
								<code>
									{message ? (
										<>
											<span className="text-red-400">$ </span>
											<span className="text-red-300">{message}</span>
											{'\n\n'}
										</>
									) : null}
									{stack ? <span className="text-gray-400">{stack}</span> : null}
								</code>
							</pre>
						</div>
					) : (
						message && <p className="mt-4 text-base text-gray-600">{message}</p>
					)}
					<div className={`mt-8 ${isDev ? '' : 'text-center'}`}>
						<Link
							href="/"
							className="rounded-md bg-black px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
						>
							Go home
						</Link>
					</div>
				</div>
			</div>
		</>
	);
}
