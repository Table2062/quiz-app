'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/store/useUserStore';
import { supabase } from '@/lib/supabaseClient';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRole?: 'admin' | 'user';
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
    const router = useRouter();
    const { user, loading } = useAuth();
    const [role, setRole] = useState<string | null>(null);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const verifyAccess = async () => {
            if (loading) return;

            // 🔹 1. Non loggato → redirect a /login
            if (!user) {
                router.replace('/login');
                return;
            }

            // 🔹 2. Recupera ruolo solo se necessario
            const { data, error } = await supabase
                .from('users')
                .select('role')
                .eq('id', user.id)
                .single();

            if (error) {
                console.error('Errore recupero ruolo:', error.message);
                router.replace('/login');
                return;
            }

            const userRole = data?.role;
            setRole(userRole);

            // 🔹 3. Ruolo non valido per la pagina
            if (requiredRole && userRole !== requiredRole) {
                if (userRole === 'admin') router.replace('/admin');
                else if (userRole === 'user') router.replace('/quiz');
                else router.replace('/');
                return;
            }

            setChecking(false);
        };

        verifyAccess();
    }, [user, loading, requiredRole, router]);

    if (loading || checking) {
        return (
            <div className="flex items-center justify-center h-screen text-gray-300">
                Verifica accesso...
            </div>
        );
    }

    return <>{children}</>;
}