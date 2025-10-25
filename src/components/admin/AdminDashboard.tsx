'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/store/useUserStore';

interface ContestOption {
    DESSERT: string[];
    COSPLAY: string[];
}

interface ContestLeaderboardRow {
    candidate: string;
    total_points: number;
}

interface ContestVoter {
    username: string;
    total_votes: number;
}

export default function AdminDashboard() {
    const { user, loading } = useAuth();
    const [role, setRole] = useState<string | null>(null);
    const [quizState, setQuizState] = useState<any | null>(null);
    const [contestState, setContestState] = useState<any | null>(null);

    const [contestOptions, setContestOptions] = useState<ContestOption | null>(null);
    const [contestLeaderboard, setContestLeaderboard] = useState<ContestLeaderboardRow[]>([]);
    const [contestVoters, setContestVoters] = useState<ContestVoter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [inactiveTab, setInactiveTab] = useState<'start' | 'leaderboard' | 'contest'>('contest');

    // ============================================================
    // Ruolo admin + caricamento base
    // ============================================================
    useEffect(() => {
        const init = async () => {
            if (!user) return;

            const [{ data: roleData }, { data: quiz }, { data: contest }] = await Promise.all([
                supabase.from('users').select('role').eq('id', user.id).single(),
                supabase.from('quiz_state').select('*').eq('is_active', true).single(),
                supabase.from('contest_state').select('*').eq('is_active', true).single(),
            ]);

            setRole(roleData?.role ?? null);
            setQuizState(quiz ?? null);
            setContestState(contest ?? null);

            try {
                const json = await fetch('/data/contest_options.json');
                const parsed = await json.json();
                setContestOptions(parsed);
            } catch {
                console.error('Errore caricamento contest_options.json');
            }

            setIsLoading(false);
        };
        init();

        const channel = supabase
            .channel('contest_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contest_state' }, (payload) => {
                const newState: any = payload.new || {};
                setContestState(newState.is_active ? newState : null);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    // ============================================================
    // Apri / chiudi contest
    // ============================================================
    const toggleContest = async (category: string, open: boolean) => {
        if (quizState) {
            alert('Chiudi prima il quiz attivo.');
            return;
        }

        if (open) {
            await supabase.from('contest_state').update({ is_active: false }).eq('is_active', true);
            await supabase.from('contest_state').insert({ category, is_active: true });
            setContestState({ category, is_active: true });
            setContestLeaderboard([]);
            setContestVoters([]);
        } else {
            await supabase
                .from('contest_state')
                .update({ is_active: false, ended_at: new Date().toISOString() })
                .eq('category', category)
                .eq('is_active', true);
            setContestState(null);
            await loadContestResults(category);
        }
    };

    // ============================================================
    // Carica classifica e votanti
    // ============================================================
    const loadContestResults = async (category: string) => {
        const [{ data: lb }, { data: voters }] = await Promise.all([
            supabase.rpc('get_contest_leaderboard', { p_category: category }),
            supabase.rpc('get_contest_voters', { p_category: category }),
        ]);
        if (lb) setContestLeaderboard(lb);
        if (voters) setContestVoters(voters);
    };

    // ============================================================
    // Render
    // ============================================================
    if (loading || isLoading)
        return <div className="p-6 text-center text-gray-500">Caricamento...</div>;

    if (role !== 'admin')
        return (
            <div className="p-6 text-center">
                <p className="text-lg">Accesso negato 🚫</p>
                <Link href="/login" className="text-[var(--color-primary)] hover:underline">
                    Torna al login
                </Link>
            </div>
        );

    return (
        <main className="max-w-5xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">Dashboard Admin</h1>

            {/* Tab unici qui */}
            <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Gestione votazioni</h2>
                <p className="text-gray-600 mb-6">
                    Qui puoi aprire o chiudere le votazioni per <b>DESSERT</b> e <b>COSPLAY</b>.
                </p>

                {contestState ? (
                    <div className="mb-8">
                        <p className="text-green-600 font-semibold mb-3">
                            🟢 Votazione attiva: {contestState.category}
                        </p>
                        <button
                            onClick={() => toggleContest(contestState.category, false)}
                            className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700"
                        >
                            Chiudi votazione
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="mb-10">
                            <h3 className="text-lg font-semibold mb-2">🍰 DESSERT CONTEST</h3>
                            <p className="text-gray-500 mb-4">Ogni utente vota un partecipante (12 punti).</p>
                            <button
                                onClick={() => toggleContest('DESSERT', true)}
                                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
                            >
                                Apri votazione
                            </button>
                            <ul className="mt-3 list-disc list-inside text-gray-700">
                                {contestOptions?.DESSERT.map((opt) => (
                                    <li key={opt}>{opt}</li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold mb-2">🎭 COSPLAY CONTEST</h3>
                            <p className="text-gray-500 mb-4">
                                Ogni utente vota tre partecipanti (12, 10, 8 punti).
                            </p>
                            <button
                                onClick={() => toggleContest('COSPLAY', true)}
                                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
                            >
                                Apri votazione
                            </button>
                            <ul className="mt-3 list-disc list-inside text-gray-700">
                                {contestOptions?.COSPLAY.map((opt) => (
                                    <li key={opt}>{opt}</li>
                                ))}
                            </ul>
                        </div>
                    </>
                )}

                {/* Classifica finale */}
                {contestLeaderboard.length > 0 && (
                    <div className="mt-8">
                        <h3 className="text-lg font-semibold mb-2">🏁 Classifica finale</h3>
                        <table className="min-w-full border text-sm mb-6">
                            <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-2 text-left">#</th>
                                <th className="px-4 py-2 text-left">Partecipante</th>
                                <th className="px-4 py-2 text-left">Punti</th>
                            </tr>
                            </thead>
                            <tbody>
                            {contestLeaderboard.map((row, idx) => (
                                <tr
                                    key={idx}
                                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}
                                >
                                    <td className="px-4 py-2">{idx + 1}</td>
                                    <td className="px-4 py-2">{row.candidate}</td>
                                    <td className="px-4 py-2 font-medium">{row.total_points}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>

                        {/* Votanti */}
                        <h3 className="text-lg font-semibold mb-2">🗳️ Utenti che hanno votato</h3>
                        {contestVoters.length === 0 ? (
                            <p className="text-gray-500">Nessun voto registrato.</p>
                        ) : (
                            <table className="min-w-full border text-sm">
                                <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-2 text-left">Utente</th>
                                    <th className="px-4 py-2 text-left">Numero voti</th>
                                </tr>
                                </thead>
                                <tbody>
                                {contestVoters.map((v, idx) => (
                                    <tr
                                        key={idx}
                                        className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}
                                    >
                                        <td className="px-4 py-2">{v.username}</td>
                                        <td className="px-4 py-2">{v.total_votes}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}