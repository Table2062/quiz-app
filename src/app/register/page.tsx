'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import LoadingScreen from '@/components/LoadingScreen';
import styles from './RegisterPage.module.css';
import TrimmedInput from "@/components/TrimmedInput";

export default function RegisterPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const router = useRouter();

    const handleRegister = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) {
            setMessage(error.message);
        } else if (data.user) {
            setMessage('Registrazione completata! Verifica la tua email.');
            setTimeout(() => router.push('/login'), 1500);
        }

        setLoading(false);
    };

    if (loading) return <LoadingScreen message="Registrazione in corso..." />;

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <h1 className={styles.title}>Registrazione</h1>
                <form onSubmit={handleRegister} className={styles.form}>
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
                        {loading ? 'Registrazione...' : 'Registrati'}
                    </button>
                </form>
                {message && <p className={styles.info}>{message}</p>}

                <div className={styles.loginLink}>
                    <p>
                        Hai già un account?{' '}
                        <Link href="/login" className={styles.link}>
                            Accedi qui
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}