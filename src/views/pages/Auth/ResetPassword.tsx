import React from 'react';
import { useForm } from '@inertiajs/react';

interface ResetPasswordProps {
    token: string;
    email: string;
    errors?: {
        token?: string[];
        password?: string[];
        password_confirmation?: string[];
    };
}

export default function ResetPassword({ token, email, errors }: ResetPasswordProps) {
    const { data, setData, post, processing } = useForm({
        token,
        email,
        password: '',
        password_confirmation: ''
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/reset-password');
    };

    return (
        <div className="min-h-screen flex">
            <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
                <div className="mx-auto w-full max-w-sm lg:w-96">
                    <div>
                        <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
                            Reset your password
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            Enter a new password for your account.
                        </p>
                    </div>

                    <div className="mt-8">
                        {errors?.token && (
                            <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200">
                                <p className="text-sm text-red-700">{errors.token[0]}</p>
                            </div>
                        )}

                        <form className="space-y-6" onSubmit={handleSubmit}>
                            <input type="hidden" value={data.token} onChange={() => {}} />
                            <input type="hidden" value={data.email} onChange={() => {}} />

                            <div>
                                <label htmlFor="password" className="block text-sm font-medium leading-6 text-gray-900">
                                    New password
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
                                        className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-black-600 sm:text-sm sm:leading-6 px-3"
                                        placeholder="At least 8 characters"
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
                                        className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-black-600 sm:text-sm sm:leading-6 px-3"
                                        placeholder="Repeat your new password"
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
                                    {processing ? 'Resetting...' : 'Reset password'}
                                </button>
                            </div>

                            <div className="text-center">
                                <a href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">
                                    Back to sign in
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
