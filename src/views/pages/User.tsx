import { Head, Link } from '@inertiajs/react';
import Navigation from '@/views/components/Navigation';

interface User {
	id: number;
	name: string;
	email: string;
}

interface Props {
	user: User;
}

export default function User({ user }: Props) {
	return (
		<>
			<Head title={`User: ${user.name}`} />
			<div className="min-h-screen bg-gray-50">
				<Navigation />
				
				<main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
					<div className="px-4 py-6 sm:px-0">
						<div className="mb-4">
							<Link href="/users" className="text-gray-600 hover:text-gray-900 hover:underline">
								← Back to Users
							</Link>
						</div>

						<div className="bg-white overflow-hidden shadow rounded-lg">
							<div className="px-4 py-5 sm:p-6">
								<h1 className="text-3xl font-light mb-4">{user.name}</h1>
								<div className="space-y-3">
									<div>
										<span className="font-medium text-gray-700">Email:</span>
										<span className="ml-2 text-gray-600">{user.email}</span>
									</div>
									<div>
										<span className="font-medium text-gray-700">User ID:</span>
										<span className="ml-2 text-gray-600">{user.id}</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</main>
			</div>
		</>
	);
}
