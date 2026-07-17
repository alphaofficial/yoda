import React from 'react';
import { useForm } from '@inertiajs/react';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin-password';

interface LoginProps {
    status?: string;
    errors?: {
        email?: string[];
        password?: string[];
    };
}

export default function Login({ status, errors }: LoginProps) {
    const { data, setData, post, processing } = useForm({
        email: '',
        password: ''
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/login');
    };

    const handleAdminLogin = () => {
        setData({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        });
        post('/login');
    };

    return (
        <div className="min-h-screen flex">
            <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
                <div className="mx-auto w-full max-w-sm lg:w-96">
                    <div>
                        <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
                            Welcome back
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            Don't have an account?{' '}
                            <a href="/register" className="font-medium text-black-600 hover:text-black-500">
                                Sign up
                            </a>
                        </p>
                    </div>

                    <div className="mt-8">
                        {status && (
                            <div className="mb-4 p-3 rounded-md bg-green-50 border border-green-200">
                                <p className="text-sm text-green-700">{status}</p>
                            </div>
                        )}
                        <form className="space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">
                                    Email address
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        value={data.email}
                                        onChange={e => setData('email', e.target.value)}
                                        className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-black-600 sm:text-sm sm:leading-6 px-3"
                                        placeholder="Enter your email"
                                    />
                                    {errors?.email && (
                                        <p className="mt-2 text-sm text-red-600">{errors.email[0]}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label htmlFor="password" className="block text-sm font-medium leading-6 text-gray-900">
                                    Password
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        value={data.password}
                                        onChange={e => setData('password', e.target.value)}
                                        className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-black sm:text-sm sm:leading-6 px-3"
                                        placeholder="Enter your password"
                                    />
                                    {errors?.password && (
                                        <p className="mt-2 text-sm text-red-600">{errors.password[0]}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="flex w-full justify-center rounded-md bg-black px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
                                >
                                    {processing ? 'Signing in...' : 'Sign in'}
                                </button>
                            </div>

                            <div>
                                <button
                                    type="button"
                                    onClick={handleAdminLogin}
                                    disabled={processing}
                                    className="flex w-full justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold leading-6 text-gray-900 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
                                >
                                    Login as admin
                                </button>
                            </div>

                            <div className="text-center">
                                <a href="/forgot-password" className="text-sm font-medium text-gray-600 hover:text-gray-900">
                                    Forgot your password?
                                </a>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <div className="relative hidden w-0 flex-1 lg:block">
                <div className="absolute inset-0 bg-black">
                    <div className="flex h-full items-center justify-center">
                        <div className="text-center">
                            <h1 className="text-4xl font-bold text-white mb-4">The Boring Architecture</h1>
                            <p className="text-xl text-black">A fullstack starter for Express &amp; React</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
