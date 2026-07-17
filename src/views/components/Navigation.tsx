import { Link, useForm, usePage } from '@inertiajs/react';
import { PageProps as InertiaPageProps } from '@inertiajs/core';

interface PageProps extends InertiaPageProps {
    isAuthenticated: boolean;
    user?: {
        id: string;
        name: string;
        email: string;
    } | null;
}

export default function Navigation() {
    const { props } = usePage<PageProps>();
    const { isAuthenticated, user } = props;
    const { post } = useForm();

    const handleLogout = (e: React.FormEvent) => {
        e.preventDefault();
        post('/logout');
    };

    return (
        <nav className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex space-x-8">
                        <Link href="/" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700">
                            Home
                        </Link>
                        <Link href="/about" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-gray-700">
                            About
                        </Link>
                        {isAuthenticated && (
                            <>
                                <Link href="/users" className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-gray-700">
                                    Users
                                </Link>
                            </>
                        )}
                    </div>

                    <div className="flex items-center space-x-4">
                        {isAuthenticated ? (
                            <>
                                <span className="text-sm text-gray-700">Welcome, {user?.name}!</span>
                                <form onSubmit={handleLogout} className="inline">
                                    <button
                                        type="submit"
                                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                                    >
                                        Logout
                                    </button>
                                </form>
                            </>
                        ) : (
                            <div className="space-x-2">
                                <Link href="/login" className="text-gray-600 hover:text-gray-900 px-3 py-1 text-sm font-medium">
                                    Login
                                </Link>
                                <Link href="/register" className="bg-black-600 hover:bg-black-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors">
                                    Register
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}