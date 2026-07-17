import Navigation from '@/views/components/Navigation';
import { usePage } from '@inertiajs/react';
import { PageProps as InertiaPageProps } from '@inertiajs/core';

interface PageProps extends InertiaPageProps {
    user?: {
        id: string;
        name: string;
        email: string;
    } | null;
}

export default function Dashboard() {
    const { props } = usePage<PageProps>();
    const { user } = props;

    return (
        <div className="min-h-screen bg-gray-50">
            <Navigation />

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    <div className="bg-white overflow-hidden shadow rounded-lg">
                        <div className="px-4 py-5 sm:p-6">
                            <h2 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                                User Information
                            </h2>
                            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                                <div>
                                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                                    <dd className="mt-1 text-sm text-gray-900">{user?.name}</dd>
                                </div>
                                <div>
                                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                                    <dd className="mt-1 text-sm text-gray-900">{user?.email}</dd>
                                </div>
                            </dl>
                        </div>
                    </div>

                    <div className="mt-6">
                        <div className="overflow-hidden">
                            <div>
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                                    Quick Actions
                                </h3>
                                <div className="space-y-3">
                                    <a
                                        href="/users"
                                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-black-600 hover:bg-black-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black-500"
                                    >
                                        View Users
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
