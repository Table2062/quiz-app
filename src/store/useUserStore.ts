import { create } from 'zustand';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface UserState {
    user: any;
    session: any;
    loading: boolean;
    setUser: (user: any) => void;
    setSession: (session: any) => void;
    setLoading: (loading: boolean) => void;
}

export const useUserStore = create<UserState>((set) => ({
    user: null,
    session: null,
    loading: true,
    setUser: (user) => set({ user }),
    setSession: (session) => set({ session }),
    setLoading: (loading) => set({ loading }),
}));

export function useAuth() {
    const { user, session, loading, setUser, setSession, setLoading } = useUserStore();

    useEffect(() => {
        const init = async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        };

        init();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, [setSession, setUser, setLoading]);

    return { user, session, loading };
}