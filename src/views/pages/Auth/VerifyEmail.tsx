import React from 'react';
import { useForm } from '@inertiajs/react';

interface VerifyEmailProps {
    email?: string;
    status?: string;
    errors?: {
        email?: string[];
    };
}

export default function VerifyEmail({ email, status, errors }: VerifyEmailProps) {
    const { post, processing } = useForm({});

    const handleResend = (e: React.FormEvent) => {
        e.preventDefault();
        post('/email/resend-verification');
    };

    return (
        <div className="min-h-screen flex">
            <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
                <div className="mx-auto w-full max-w-sm lg:w-96">
                    <div>
                        <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
                            Verify your email
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            We sent a verification link to <strong>{email}</strong>. Check your inbox and click the link to activate your account.
                        </p>
                    </div>

                    <div className="mt-8">
                        {status && (
                            <div className="mb-4 p-3 rounded-md bg-green-50 border border-green-200">
                                <p className="text-sm text-green-700">{status}</p>
                            </div>
                        )}

                        {errors?.email && (
                            <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200">
                                <p className="text-sm text-red-700">{errors.email[0]}</p>
                            </div>
                        )}

                        <form onSubmit={handleResend} className="space-y-4">
                            <button
                                type="submit"
                                disabled={processing}
                                className="flex w-full justify-center rounded-md bg-black px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
                            >
                                {processing ? 'Sending...' : 'Resend verification email'}
                            </button>
                        </form>

                        <div className="mt-4 text-center">
                            <a href="/logout" className="text-sm font-medium text-gray-600 hover:text-gray-900">
                                Sign out
                            </a>
                        </div>
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
