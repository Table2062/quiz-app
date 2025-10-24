'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import LoadingScreen from '@/components/LoadingScreen';

export default function HomePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkUserAndRedirect = async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();

            if (session?.user) {
                const { data: profile } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();

                if (profile?.role === 'admin') router.replace('/admin');
                else router.replace('/quiz');
            } else {
                router.replace('/login');
            }
            setLoading(false);
        };

        checkUserAndRedirect();
    }, [router]);

    return <LoadingScreen message="Verifica accesso in corso..." />;
}