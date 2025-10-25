'use client';
import { useState, useEffect, useRef, Dispatch, SetStateAction } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/store/useUserStore';

// =============================
// TYPES
// =============================
type InactiveTab = 'start' | 'leaderboard' | 'contest';

interface LeaderboardRow {
    user_name: string;
    total_points: number;
    correct_answers: number;
}

interface ContestRow {
    candidate: string;
    total_points: number;
    vote_count: number;
}

// =============================
// COMPONENTE PRINCIPALE
// =============================
export default function AdminDashboard() {
    const { user, loading } = useAuth();
    const [role, setRole] = useState<string | null>(null);
    const [quizState, setQuizState] = useState<any | null>(null);
    const [contestState, setContestState] = useState<any | null>(null);
    const [questions, setQuestions] = useState<any[]>([]);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showAudio, setShowAudio] = useState(false);

    const [activeTab, setActiveTab] = useState<'question' | 'leaderboard'>('question');
    const [inactiveTab, setInactiveTab] = useState<InactiveTab>('start');

    const [lastLeaderboard, setLastLeaderboard] = useState<LeaderboardRow[]>([]);
    const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
    const [contestLeaderboard, setContestLeaderboard] = useState<ContestRow[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

    const [availableQuizzes] = useState<string[]>(['quiz1', 'quiz2', 'quiz3']);
    const [selectedQuiz, setSelectedQuiz] = useState<string>('quiz1');

    const audioRef = useRef<HTMLAudioElement | null>(null);

    // ==========================================================
    // Ruolo admin
    // ==========================================================
    useEffect(() => {
        if (!user) return;
        const fetchRole = async () => {
            const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
            setRole(data?.role ?? null);
        };
        void fetchRole();
    }, [user]);

    // ==========================================================
    // Stato quiz + realtime
    // ==========================================================
    useEffect(() => {
        const loadState = async () => {
            const { data } = await supabase.from('quiz_state').select('*').eq('is_active', true).single();
            setQuizState(data ?? null);
            setIsLoading(false);
        };
        void loadState();

        const channel = supabase
            .channel('quiz_state_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'quiz_state' },
                (payload: any) => {
                    const newData = payload.new as { is_active?: boolean } | null;
                    setQuizState(newData?.is_active ? newData : null);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // ==========================================================
    // Stato contest + realtime
    // ==========================================================
    useEffect(() => {
        const loadContest = async () => {
            const { data } = await supabase
                .from('contest_state')
                .select('*')
                .eq('is_active', true)
                .single();
            setContestState(data ?? null);
        };
        void loadContest();

        const channel = supabase
            .channel('contest_state_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'contest_state' },
                (payload: any) => {
                    const newData = payload.new as { is_active?: boolean } | null;
                    setContestState(newData?.is_active ? newData : null);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // ==========================================================
    // Carica quiz JSON
    // ==========================================================
    useEffect(() => {
        const loadQuiz = async () => {
            try {
                const mod = await import(`@/data/${selectedQuiz}_admin.json`);
                setQuestions(mod.default.questions);
            } catch {
                setQuestions([]);
            }
        };
        void loadQuiz();
    }, [selectedQuiz]);

    // ==========================================================
    // Timer sincronizzato
    // ==========================================================
    useEffect(() => {
        if (!quizState?.question_start || !quizState?.question_duration) {
            setTimeLeft(0);
            return;
        }
        const interval = setInterval(() => {
            const start = new Date(quizState.question_start).getTime();
            const elapsed = Math.floor((Date.now() - start) / 1000);
            const remaining = Math.max(quizState.question_duration - elapsed, 0);
            setTimeLeft(remaining);
        }, 1000);
        return () => clearInterval(interval);
    }, [quizState]);

    // ==========================================================
    // Audio gestione
    // ==========================================================
    const currentQuestion =
        questions.length && quizState?.current_question != null
            ? questions[quizState.current_question]
            : null;

    useEffect(() => {
        if (!currentQuestion?.audioPath || !quizState?.is_active) {
            setShowAudio(false);
            return;
        }
        setShowAudio(true);

        const playT = setTimeout(() => {
            audioRef.current?.play().catch(() => {});
        }, 1000);

        const stopT = setTimeout(() => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            setShowAudio(false);
        }, (currentQuestion.timeLimit ?? 0) * 1000);

        return () => {
            clearTimeout(playT);
            clearTimeout(stopT);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            setShowAudio(false);
        };
    }, [currentQuestion, quizState?.is_active]);

    // ==========================================================
    // Ultima classifica quiz
    // ==========================================================
    useEffect(() => {
        if (quizState) return;
        const loadLast = async () => {
            setLoadingLeaderboard(true);
            const { data: lastSession } = await supabase
                .from('quiz_state')
                .select('id')
                .eq('is_active', false)
                .order('ended_at', { ascending: false })
                .limit(1)
                .single();
            if (lastSession) {
                const { data } = await supabase.rpc('get_quiz_leaderboard', {
                    p_session_id: lastSession.id,
                });
                if (data) setLastLeaderboard(data);
            }
            setLoadingLeaderboard(false);
        };
        void loadLast();
    }, [quizState]);

    // ==========================================================
    // Ultima classifica contest chiuso
    // ==========================================================
    useEffect(() => {
        const loadContestLeaderboard = async () => {
            const { data: lastContest } = await supabase
                .from('contest_state')
                .select('category')
                .eq('is_active', false)
                .order('ended_at', { ascending: false })
                .limit(1)
                .single();

            if (lastContest) {
                const { data } = await supabase.rpc('get_contest_leaderboard', {
                    p_category: lastContest.category,
                });
                if (data) setContestLeaderboard(data);
            }
        };
        void loadContestLeaderboard();
    }, [contestState]);

    // ==========================================================
    // Avvia e chiudi contest
    // ==========================================================
    const startContest = async (category: 'DESSERT' | 'COSPLAY') => {
        if (quizState) return alert('❌ Impossibile: un quiz è in corso.');
        if (contestState) return alert('❌ C’è già una votazione attiva.');
        await supabase.from('contest_state').update({ is_active: false }).eq('is_active', true);
        await supabase.from('contest_state').insert({ category, is_active: true });
        alert(`✅ Contest ${category} avviato!`);
    };

    const closeContest = async () => {
        if (!contestState) return;
        await supabase
            .from('contest_state')
            .update({ is_active: false, ended_at: new Date().toISOString() })
            .eq('id', contestState.id);
        const { data } = await supabase.rpc('get_contest_leaderboard', {
            p_category: contestState.category,
        });
        if (data) setContestLeaderboard(data);
        setContestState(null);
    };

    // ==========================================================
    // Render
    // ==========================================================
    if (loading || isLoading)
        return <div className="p-6 text-center text-gray-500">Caricamento...</div>;

    if (role !== 'admin') {
        return (
            <div className="p-6 text-center">
                <p className="text-lg">Accesso negato 🚫</p>
                <Link href="/login" className="text-[var(--color-primary)] hover:underline">
                    Torna al login
                </Link>
            </div>
        );
    }

    // ==========================================================
    // Nessun quiz attivo
    // ==========================================================
    if (!quizState) {
        return (
            <main className="max-w-4xl mx-auto p-6">
                <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">Dashboard Admin</h1>

                {contestState ? (
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 text-center shadow">
                        <h2 className="text-xl font-semibold text-yellow-700 mb-2">
                            🗳️ Votazione attiva: {contestState.category}
                        </h2>
                        <p className="text-gray-600 mb-4">
                            È in corso la votazione per la categoria <b>{contestState.category}</b>.
                        </p>
                        <button
                            onClick={closeContest}
                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-md font-medium transition-all"
                        >
                            Chiudi votazione
                        </button>
                    </div>
                ) : (
                    <ContestManagement
                        inactiveTab={inactiveTab}
                        setInactiveTab={setInactiveTab}
                        startContest={startContest}
                        contestLeaderboard={contestLeaderboard}
                    />
                )}
            </main>
        );
    }

    return (
        <main className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Admin</h1>
            <p className="text-sm text-green-600 mb-4">
                🟢 Domanda {quizState.current_question + 1} di {questions.length}
            </p>
        </main>
    );
}

// ==========================================================
// COMPONENTE AUSILIARIO
// ==========================================================
function ContestManagement({
                               inactiveTab,
                               setInactiveTab,
                               startContest,
                               contestLeaderboard,
                           }: {
    inactiveTab: InactiveTab;
    setInactiveTab: Dispatch<SetStateAction<InactiveTab>>;
    startContest: (category: 'DESSERT' | 'COSPLAY') => void;
    contestLeaderboard: ContestRow[];
}) {
    return (
        <>
            <div className="flex justify-center mb-6 border-b border-gray-300">
                {(['start', 'leaderboard', 'contest'] as InactiveTab[]).map((tab) => (
                    <button
                        key={tab}
                        className={`px-4 py-2 font-medium ${
                            inactiveTab === tab
                                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                                : 'text-gray-600 hover:text-gray-800'
                        }`}
                        onClick={() => setInactiveTab(tab)}
                    >
                        {tab === 'start'
                            ? 'Avvia nuovo quiz'
                            : tab === 'leaderboard'
                                ? 'Classifiche quiz'
                                : 'Gestione votazioni'}
                    </button>
                ))}
            </div>

            {inactiveTab === 'contest' && (
                <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">Gestione votazioni</h2>

                    <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-2">🍰 DESSERT CONTEST</h3>
                        <button
                            onClick={() => startContest('DESSERT')}
                            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                        >
                            Apri votazione
                        </button>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold mb-2">🎭 COSPLAY CONTEST</h3>
                        <button
                            onClick={() => startContest('COSPLAY')}
                            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                        >
                            Apri votazione
                        </button>
                    </div>

                    {contestLeaderboard.length > 0 && (
                        <>
                            <h4 className="font-semibold text-gray-700 mt-6 mb-2">
                                🏆 Ultima classifica contest
                            </h4>
                            <table className="min-w-full border border-gray-200 text-sm">
                                <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">#</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Candidato</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Punti</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Voti</th>
                                </tr>
                                </thead>
                                <tbody>
                                {contestLeaderboard.map((row: ContestRow, idx: number) => (
                                    <tr
                                        key={idx}
                                        className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}
                                    >
                                        <td className="px-4 py-2">{idx + 1}</td>
                                        <td className="px-4 py-2">{row.candidate}</td>
                                        <td className="px-4 py-2">{row.total_points}</td>
                                        <td className="px-4 py-2">{row.vote_count}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            )}
        </>
    );
}