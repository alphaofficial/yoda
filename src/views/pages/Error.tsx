import { Head, Link } from '@inertiajs/react';
import { Button } from '@/views/components/ui/button';

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
			<div className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
				<div className={isDev ? 'w-full max-w-3xl' : 'text-center max-w-md'}>
					<p className="font-medium text-muted-foreground">{status}</p>
					<h1 className="display-heading mt-2 text-foreground">
						{title}
					</h1>
					{isDev ? (
						<div className="mt-6 overflow-hidden border bg-card text-left shadow-sm">
							<div className="flex items-center gap-1.5 border-b bg-muted px-4 py-2.5">
								<span className="h-3 w-3 bg-destructive" />
								<span className="h-3 w-3 bg-muted-foreground" />
								<span className="h-3 w-3 bg-primary" />
								<span className="ml-3 font-mono text-muted-foreground">error</span>
							</div>
							<pre className="whitespace-pre-wrap break-words p-4 font-mono leading-relaxed text-foreground">
								<code>
									{message ? (
										<>
											<span className="text-destructive">$ </span>
											<span className="text-destructive">{message}</span>
											{'\n\n'}
										</>
									) : null}
									{stack ? <span className="text-muted-foreground">{stack}</span> : null}
								</code>
							</pre>
						</div>
					) : (
						message && <p className="mt-4 text-muted-foreground">{message}</p>
					)}
					<div className={`mt-8 ${isDev ? '' : 'text-center'}`}>
						<Button render={<Link href="/" />}>
							Go home
						</Button>
					</div>
				</div>
			</div>
		</>
	);
}
