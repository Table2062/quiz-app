'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/store/useUserStore';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole?: 'admin' | 'user';
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
    const router = useRouter();
    const { user, loading, role, roleLoaded } = useAuth();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        if (loading) return;

        // 🔹 1. Non loggato → redirect a /login
        if (!user) {
            router.replace('/login');
            return;
        }

        // 🔹 2. Aspetta che il ruolo (già recuperato/condiviso da useAuth) sia disponibile
        if (!roleLoaded) return;

        // 🔹 Ruolo non trovato → stesso comportamento di errore di prima (redirect a /login)
        if (!role) {
            router.replace('/login');
            return;
        }

        // 🔹 3. Ruolo non valido per la pagina
        if (requiredRole && role !== requiredRole) {
            if (role === 'admin') router.replace('/admin');
            else if (role === 'user') router.replace('/quiz');
            else router.replace('/');
            return;
        }

        setChecking(false);
    }, [user, loading, role, roleLoaded, requiredRole, router]);

    if (loading || checking) {
        return (
            <div className="flex items-center justify-center h-screen text-gray-300">
                Verifica accesso...
            </div>
        );
    }

    return <>{children}</>;
}