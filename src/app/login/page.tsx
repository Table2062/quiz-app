'use client';
import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import LoadingScreen from '@/components/LoadingScreen';
import styles from './LoginPage.module.css';
import TrimmedInput from "@/components/TrimmedInput"; // Importa stili modulari CSS

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [redirecting, setRedirecting] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setMessage(error.message);
        } else if (data.user) {
            const { data: profile } = await supabase
                .from('users')
                .select('role')
                .eq('id', data.user.id)
                .single();

            setRedirecting(true);
            setTimeout(() => {
                if (profile?.role === 'admin') router.push('/admin');
                else router.push('/quiz');
            }, 1000);
        }

        setLoading(false);
    };

    useEffect(() => {
        const checkSession = async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (session?.user) {
                const { data: profile } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();

                setRedirecting(true);
                setTimeout(() => {
                    if (profile?.role === 'admin') router.replace('/admin');
                    else router.replace('/quiz');
                }, 1000);
            }
        };
        checkSession();
    }, [router]);

    if (redirecting) return <LoadingScreen message="Accesso effettuato, reindirizzamento..." />;

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <h1 className={styles.title}>Login</h1>
                <form onSubmit={handleLogin} className={styles.form}>
                    <TrimmedInput
                        type="email"
                        placeholder="Email"
                        className={styles.input}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <TrimmedInput
                        type="password"
                        placeholder="Password"
                        className={styles.input}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <button type="submit" disabled={loading} className={styles.button}>
                        {loading ? 'Accesso...' : 'Accedi'}
                    </button>
                </form>
                {message && <p className={styles.error}>{message}</p>}

                <div className={styles.registerLink}>
                    <p>
                        Non hai un account?{' '}
                        <Link href="/register" className={styles.link}>
                            Registrati qui
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}