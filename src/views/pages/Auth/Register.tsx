import React from 'react';
import { useForm } from '@inertiajs/react';

interface RegisterProps {
    errors?: {
        name?: string[];
        email?: string[];
        password?: string[];
        password_confirmation?: string[];
    };
}

export default function Register({ errors }: RegisterProps) {
    const { data, setData, post, processing } = useForm({
        name: '',
        email: '',
        password: '',
        password_confirmation: ''
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/register');
    };

    return (
        <div className="min-h-screen flex">
            <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
                <div className="mx-auto w-full max-w-sm lg:w-96">
                    <div>
                        <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
                            Create account
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            Already have an account?{' '}
                            <a href="/login" className="font-medium text-black hover:text-black">
                                Sign in
                            </a>
                        </p>
                    </div>

                    <div className="mt-8">
                        <form className="space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium leading-6 text-gray-900">
                                    Full name
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="name"
                                        name="name"
                                        type="text"
                                        autoComplete="name"
                                        required
                                        value={data.name}
                                        onChange={e => setData('name', e.target.value)}
                                        className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-black sm:text-sm sm:leading-6 px-3"
                                        placeholder="Enter your full name"
                                    />
                                    {errors?.name && (
                                        <p className="mt-2 text-sm text-red-600">{errors.name[0]}</p>
                                    )}
                                </div>
                            </div>

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
                                        className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-black sm:text-sm sm:leading-6 px-3"
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
                                        autoComplete="new-password"
                                        required
                                        value={data.password}
                                        onChange={e => setData('password', e.target.value)}
                                        className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-black sm:text-sm sm:leading-6 px-3"
                                        placeholder="Create a password"
                                    />
                                    {errors?.password && (
                                        <p className="mt-2 text-sm text-red-600">{errors.password[0]}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label htmlFor="password_confirmation" className="block text-sm font-medium leading-6 text-gray-900">
                                    Confirm password
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="password_confirmation"
                                        name="password_confirmation"
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        value={data.password_confirmation}
                                        onChange={e => setData('password_confirmation', e.target.value)}
                                        className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-black sm:text-sm sm:leading-6 px-3"
                                        placeholder="Confirm your password"
                                    />
                                    {errors?.password_confirmation && (
                                        <p className="mt-2 text-sm text-red-600">{errors.password_confirmation[0]}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="flex w-full justify-center rounded-md bg-black px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
                                >
                                    {processing ? 'Creating account...' : 'Create account'}
                                </button>
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