import { Head, Link } from '@inertiajs/react';

interface Props {
	applicationName: string;
	isAuthenticated?: boolean;
}

const CARDS = [
	{
		title: 'Developer Guide',
		description: 'Add controllers, pages, models, migrations, and auth.',
		href: 'https://github.com/alphaofficial/theboringarchitecture/blob/main/README.md#building-features',
	},
	{
		title: 'GitHub',
		description: 'Source, issues, and release notes.',
		href: 'https://github.com/alphaofficial/theboringarchitecture',
	},
];

export default function Home({ applicationName, isAuthenticated }: Props) {
	return (
		<>
			<Head>
				<title>{applicationName}</title>
			</Head>
			<div className="min-h-screen bg-white text-gray-900 antialiased">
				<header className="border-b border-gray-200">
					<div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
						<div className="flex items-center gap-x-3">
							<span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-900 text-white text-sm font-bold">
								{applicationName.charAt(0)}
							</span>
							<span className="text-base font-bold tracking-tight">{applicationName}</span>
						</div>
						<nav className="flex items-center gap-x-6 text-sm font-semibold text-gray-700">
							{isAuthenticated ? (
								<Link href="/home" className="hover:text-gray-900">
									Dashboard
								</Link>
							) : (
								<>
									<Link href="/login" className="hover:text-gray-900">
										Log in
									</Link>
									<Link
										href="/register"
										className="rounded-sm bg-gray-900 px-3 py-1.5 text-white hover:bg-black"
									>
										Register
									</Link>
								</>
							)}
						</nav>
					</div>
				</header>

				<main className="mx-auto max-w-3xl px-6 py-24">
					<h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
						Welcome to {applicationName}
					</h1>
					<p className="mt-4 text-lg text-gray-600">
						Your app is up and running. Pick a starting point below.
					</p>
					<div className="mt-12 grid gap-6 sm:grid-cols-2">
						{CARDS.map((c) => (
							<a
								key={c.title}
								href={c.href}
								className="group block rounded-md border border-gray-200 p-6 transition hover:border-gray-900"
							>
								<h2 className="text-base font-bold text-gray-900">{c.title}</h2>
								<p className="mt-2 text-sm text-gray-600">{c.description}</p>
								<span className="mt-4 inline-block text-xs font-semibold uppercase tracking-wider text-gray-500 group-hover:text-gray-900">
									Open →
								</span>
							</a>
						))}
					</div>
					<p className="mt-12 text-sm text-gray-500">
						Edit <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">src/views/pages/Home.tsx</code> and save to reload.
					</p>
				</main>
			</div>
		</>
	);
}
