import { create } from 'zustand';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface UserState {
    user: any;
    session: any;
    loading: boolean;
    role: string | null;
    roleLoaded: boolean;
    setUser: (user: any) => void;
    setSession: (session: any) => void;
    setLoading: (loading: boolean) => void;
    setRole: (role: string | null) => void;
    setRoleLoaded: (roleLoaded: boolean) => void;
}

export const useUserStore = create<UserState>((set) => ({
    user: null,
    session: null,
    loading: true,
    role: null,
    roleLoaded: false,
    setUser: (user: any) => set({ user }),
    setSession: (session) => set({ session }),
    setLoading: (loading) => set({ loading }),
    setRole: (role) => set({ role }),
    setRoleLoaded: (roleLoaded) => set({ roleLoaded }),
}));

// Evita di rifare la stessa query "role" per ogni componente che monta useAuth()
// nello stesso momento (es. Navbar + AdminDashboard): la prima richiesta per un
// dato userId viene condivisa da tutti, riducendo il carico su Supabase con più
// dispositivi collegati contemporaneamente.
let roleFetchUserId: string | null = null;

export function useAuth() {
    const { user, session, loading, role, roleLoaded, setUser, setSession, setLoading, setRole, setRoleLoaded } =
        useUserStore();

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

    useEffect(() => {
        if (!user) {
            roleFetchUserId = null;
            setRole(null);
            setRoleLoaded(false);
            return;
        }

        if (roleFetchUserId === user.id) return;
        roleFetchUserId = user.id;

        supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                setRole(data?.role ?? null);
                setRoleLoaded(true);
            });
    }, [user, setRole, setRoleLoaded]);

    return { user, session, loading, role, roleLoaded };
}