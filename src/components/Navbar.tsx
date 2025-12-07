'use client';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/store/useUserStore';
import { useEffect, useState } from 'react';

export default function Navbar() {
    const { user, session, loading } = useAuth();
    const [role, setRole] = useState<string | null>(null);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.replace('/login');
    };

    useEffect(() => {
        const fetchRole = async () => {
            if (user) {
                const { data } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', user.id)
                    .single();
                setRole(data?.role ?? null);
            }
        };
        fetchRole();
    }, [user]);

    if (loading) return null;

    return (
        <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
            <nav className="max-w-7xl mx-auto flex justify-between items-center px-6 py-3">
                {/* Logo */}
                {/* Logo con cappellino di Natale */}
                <Link
                    href="/"
                    className="flex items-center gap-2 text-xl font-semibold text-gray-900 tracking-tight hover:text-[var(--color-primary)] transition-colors"
                >
                    <span>
                        Quiz<span className="text-[var(--color-primary)]">App</span>
                    </span>

                    {/* Emoji cappellino Babbo Natale */}
                    <span className="text-2xl leading-none -mt-1">🎅</span>
                </Link>

                {/* Navigation Links */}
                {/*<div className="hidden sm:flex items-center gap-6">*/}
                {/*    {user && role === 'user' && (*/}
                {/*        <Link*/}
                {/*            href="/quiz"*/}
                {/*            className="text-gray-700 hover:text-[var(--color-primary)] font-medium transition-colors"*/}
                {/*        >*/}
                {/*            Quiz*/}
                {/*        </Link>*/}
                {/*    )}*/}
                {/*    {user && role === 'admin' && (*/}
                {/*        <Link*/}
                {/*            href="/admin"*/}
                {/*            className="text-gray-700 hover:text-[var(--color-primary)] font-medium transition-colors"*/}
                {/*        >*/}
                {/*            Admin*/}
                {/*        </Link>*/}
                {/*    )}*/}
                {/*</div>*/}

                {/* Auth Buttons */}
                <div className="flex items-center gap-3">
                    {session ? (
                        <button
                            onClick={handleLogout}
                            className="bg-[var(--color-error)] text-white px-4 py-2 rounded-lg font-medium text-sm shadow-sm hover:shadow-md transition-all hover:bg-red-600 hover:-translate-y-[1px]"
                        >
                            Logout
                        </button>
                    ) : (
                        <Link
                            href="/login"
                            className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg font-medium text-sm shadow-sm hover:shadow-md transition-all hover:bg-[var(--color-primary-hover)] hover:-translate-y-[1px]"
                        >
                            Login
                        </Link>
                    )}
                </div>
            </nav>
        </header>
    );
}