'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/store/useUserStore';

interface LeaderboardRow {
    user_name: string;
    total_points: number;
    correct_answers: number;
}

interface ContestLeaderboardRow {
    candidate: string;
    total_points: number;
}

export default function AdminDashboard() {
    const { user, loading } = useAuth();

    const [role, setRole] = useState<string | null>(null);
    const [quizState, setQuizState] = useState<any | null>(null);
    const [contestState, setContestState] = useState<any | null>(null);

    const [questions, setQuestions] = useState<any[]>([]);
    const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
    const [lastLeaderboard, setLastLeaderboard] = useState<LeaderboardRow[]>([]);
    const [contestLeaderboard, setContestLeaderboard] = useState<ContestLeaderboardRow[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [timeLeft, setTimeLeft] = useState(0);
    const [showAudio, setShowAudio] = useState(false);

    const [activeTab, setActiveTab] = useState<'question' | 'leaderboard'>('question');
    const [inactiveTab, setInactiveTab] = useState<'start' | 'leaderboard' | 'contest'>('start');
    const [selectedQuiz, setSelectedQuiz] = useState<string>('quiz1');
    const [availableQuizzes] = useState<string[]>(['quiz1', 'quiz2', 'quiz3']);

    const audioRef = useRef<HTMLAudioElement | null>(null);

    // ============================================================
    // Ruolo admin
    // ============================================================
    useEffect(() => {
        const fetchRole = async () => {
            if (!user) return;
            const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
            setRole(data?.role ?? null);
        };
        fetchRole();
    }, [user]);

    // ============================================================
    // Stato quiz e contest realtime
    // ============================================================
    useEffect(() => {
        const loadStates = async () => {
            const [{ data: quiz }, { data: contest }] = await Promise.all([
                supabase.from('quiz_state').select('*').eq('is_active', true).single(),
                supabase.from('contest_state').select('*').eq('is_active', true).single(),
            ]);
            setQuizState(quiz ?? null);
            setContestState(contest ?? null);
            setIsLoading(false);
        };
        loadStates();

        const channel = supabase
            .channel('admin_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_state' }, (payload) => {
                const newState: any = payload.new || {};
                setQuizState(newState.is_active ? newState : null);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contest_state' }, (payload) => {
                const newState: any = payload.new || {};
                setContestState(newState.is_active ? newState : null);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // ============================================================
    // Caricamento quiz JSON
    // ============================================================
    useEffect(() => {
        const loadQuiz = async () => {
            if (!selectedQuiz) return;
            try {
                const mod = await import(`@/data/${selectedQuiz}_admin.json`);
                setQuestions(mod.default.questions);
            } catch {
                setQuestions([]);
            }
        };
        loadQuiz();
    }, [selectedQuiz]);

    // ============================================================
    // Timer quiz
    // ============================================================
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

    // ============================================================
    // Audio
    // ============================================================
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

    // ============================================================
    // Classifica quiz corrente
    // ============================================================
    useEffect(() => {
        const fetchLeaderboard = async () => {
            if (!quizState?.id) return;
            const { data } = await supabase.rpc('get_quiz_leaderboard', {
                p_session_id: quizState.id,
            });
            if (data) setLeaderboard(data as LeaderboardRow[]);
        };
        fetchLeaderboard();
    }, [quizState?.id, quizState?.current_question]);

    // ============================================================
    // Ultima classifica quiz (quando non attivo)
    // ============================================================
    useEffect(() => {
        if (quizState) return;

        const loadLast = async () => {
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
                if (data) setLastLeaderboard(data as LeaderboardRow[]);
            } else {
                setLastLeaderboard([]);
            }
        };

        loadLast();
    }, [quizState]);

    // ============================================================
    // Avvio quiz
    // ============================================================
    const uploadCorrectAnswers = async (quizName: string) => {
        const mod = await import(`@/data/${quizName}_admin.json`);
        const data = mod.default;
        if (!data?.questions?.length) return;

        const rows = data.questions.map((q: any) => ({
            quiz_id: quizName,
            question_id: q.id,
            question_type: q.type,
            correct_options: q.correctAnswers,
            points_base: q.points ?? 0,
            time_limit: q.timeLimit ?? 0,
            bonus_mode: q.speedBonus?.mode ?? 'none',
            bonus_max: q.speedBonus?.maxBonus ?? 0,
        }));

        await supabase.from('correct_answers').delete().eq('quiz_id', quizName);
        await supabase.from('correct_answers').insert(rows);
    };

    const startQuiz = async () => {
        if (contestState) {
            alert('Chiudi prima la votazione attiva per avviare un quiz.');
            return;
        }

        await uploadCorrectAnswers(selectedQuiz);
        await supabase.from('quiz_state').update({ is_active: false }).eq('is_active', true);

        const { data, error } = await supabase
            .from('quiz_state')
            .insert({
                quiz_name: selectedQuiz,
                current_question: 0,
                question_start: new Date().toISOString(),
                question_duration: questions[0]?.timeLimit ?? 30,
                is_active: true,
            })
            .select()
            .single();

        if (!error) {
            setQuizState(data);
            setActiveTab('question');
        }
    };

    // ============================================================
    // Prossima domanda / termina quiz
    // ============================================================
    const nextQuestion = async () => {
        if (!quizState || !questions.length) return;
        const next = (quizState.current_question ?? 0) + 1;

        // fine quiz
        if (next >= questions.length) {
            const { error } = await supabase
                .from('quiz_state')
                .update({ is_active: false, ended_at: new Date().toISOString() })
                .eq('id', quizState.id);

            if (error) {
                console.error('Errore chiusura quiz:', error);
                return;
            }

            // carica subito classifica finale e passa alla tab leaderboard
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
                if (data) setLastLeaderboard(data as LeaderboardRow[]);
            }

            setQuizState(null);
            setInactiveTab('leaderboard');
            setActiveTab('leaderboard');
            return;
        }

        // domanda successiva
        const { data, error } = await supabase
            .from('quiz_state')
            .update({
                current_question: next,
                question_start: new Date().toISOString(),
                question_duration: questions[next]?.timeLimit ?? 30,
            })
            .eq('id', quizState.id)
            .select()
            .single();

        if (!error) setQuizState(data);
    };

    // ============================================================
    // Contest: apertura/chiusura e classifica
    // ============================================================
    const toggleContest = async (category: string, open: boolean) => {
        if (quizState) {
            alert('Chiudi prima il quiz per aprire una votazione.');
            return;
        }

        if (open) {
            await supabase.from('contest_state').update({ is_active: false }).eq('is_active', true);
            await supabase.from('contest_state').insert({ category, is_active: true });
            setContestState({ category, is_active: true });
            setContestLeaderboard([]);
        } else {
            await supabase
                .from('contest_state')
                .update({ is_active: false, ended_at: new Date().toISOString() })
                .eq('category', category)
                .eq('is_active', true);
            setContestState(null);

            const { data } = await supabase.rpc('get_contest_leaderboard', { p_category: category });
            if (data) setContestLeaderboard(data as ContestLeaderboardRow[]);
        }
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

    // ============================================================
    // Nessun quiz attivo
    // ============================================================
    if (!quizState) {
        return (
            <main className="max-w-4xl mx-auto p-6">
                <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">Dashboard Admin</h1>

                {/* Tabs */}
                <div className="flex justify-center mb-6 border-b border-gray-300">
                    {['start', 'leaderboard', 'contest'].map((tab) => (
                        <button
                            key={tab}
                            className={`px-4 py-2 font-medium ${
                                inactiveTab === (tab as 'start' | 'leaderboard' | 'contest')
                                    ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                                    : 'text-gray-600 hover:text-gray-800'
                            }`}
                            onClick={() => setInactiveTab(tab as 'start' | 'leaderboard' | 'contest')}
                        >
                            {tab === 'start'
                                ? 'Avvia nuovo quiz'
                                : tab === 'leaderboard'
                                    ? 'Ultima classifica'
                                    : 'Votazioni'}
                        </button>
                    ))}
                </div>

                {/* Avvio quiz */}
                {inactiveTab === 'start' && (
                    <div className="bg-white shadow-lg rounded-lg p-8 border border-gray-200 text-center">
                        {contestState ? (
                            <p className="text-red-600 font-semibold">
                                ⚠️ Votazione {contestState.category} attiva — chiudi prima di avviare un quiz.
                            </p>
                        ) : (
                            <>
                                <h2 className="text-lg font-semibold text-gray-700 mb-4">Nessun quiz attivo</h2>
                                <p className="text-gray-600 mb-6">
                                    Seleziona un quiz e avvialo per iniziare una nuova sessione.
                                </p>
                                <select
                                    value={selectedQuiz}
                                    onChange={(e) => setSelectedQuiz(e.target.value)}
                                    className="border border-gray-300 rounded-md px-3 py-2 mb-4"
                                >
                                    {availableQuizzes.map((q) => (
                                        <option key={q} value={q}>
                                            {q}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={startQuiz}
                                    className="bg-[var(--color-primary)] text-white px-6 py-3 rounded-md font-semibold hover:bg-[var(--color-primary-hover)]"
                                >
                                    Avvia quiz
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Classifica ultima sessione */}
                {inactiveTab === 'leaderboard' && (
                    <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-700 mb-4">Ultima classifica</h2>
                        {lastLeaderboard.length === 0 ? (
                            <p className="text-gray-500 text-center">Nessuna classifica disponibile.</p>
                        ) : (
                            <table className="min-w-full border text-sm">
                                <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-2 text-left">#</th>
                                    <th className="px-4 py-2 text-left">Utente</th>
                                    <th className="px-4 py-2 text-left">Punti</th>
                                    <th className="px-4 py-2 text-left">Corrette</th>
                                </tr>
                                </thead>
                                <tbody>
                                {lastLeaderboard.map((row, idx) => (
                                    <tr
                                        key={idx}
                                        className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}
                                    >
                                        <td className="px-4 py-2">{idx + 1}</td>
                                        <td className="px-4 py-2">{row.user_name}</td>
                                        <td className="px-4 py-2">{row.total_points}</td>
                                        <td className="px-4 py-2">{row.correct_answers}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {/* Votazioni */}
                {inactiveTab === 'contest' && (
                    <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">Gestione votazioni</h2>
                        {contestState ? (
                            <div className="mb-6">
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
                                <div className="mb-8">
                                    <h3 className="text-lg font-semibold mb-2">🍰 DESSERT CONTEST</h3>
                                    <p className="text-gray-500 mb-4">Ogni utente vota un partecipante (12 punti).</p>
                                    <button
                                        onClick={() => toggleContest('DESSERT', true)}
                                        className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
                                    >
                                        Apri votazione
                                    </button>
                                </div>

                                <div>
                                    <h3 className="text-lg font-semibold mb-2">🎭 COSPLAY CONTEST</h3>
                                    <p className="text-gray-500 mb-4">Ogni utente vota tre partecipanti (12, 10, 8 punti).</p>
                                    <button
                                        onClick={() => toggleContest('COSPLAY', true)}
                                        className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
                                    >
                                        Apri votazione
                                    </button>
                                </div>
                            </>
                        )}

                        {contestLeaderboard.length > 0 && (
                            <div className="mt-8">
                                <h3 className="text-lg font-semibold mb-2">🏁 Classifica finale</h3>
                                <table className="min-w-full border text-sm">
                                    <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-2 text-left">#</th>
                                        <th className="px-4 py-2 text-left">Partecipante</th>
                                        <th className="px-4 py-2 text-left">Punti</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {contestLeaderboard.map((row: ContestLeaderboardRow, idx) => (
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
                            </div>
                        )}
                    </div>
                )}
            </main>
        );
    }

    // ============================================================
    // Quiz attivo
    // ============================================================
    const currentIndex = (quizState?.current_question ?? 0) + 1;

    return (
        <main className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Admin</h1>

            {/* Tabs quiz attivo */}
            <div className="flex mb-6 border-b border-gray-300">
                {(['question', 'leaderboard'] as const).map((tab) => (
                    <button
                        key={tab}
                        className={`px-4 py-2 font-medium ${
                            activeTab === tab
                                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                                : 'text-gray-600 hover:text-gray-800'
                        }`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'question' ? 'Domanda corrente' : 'Classifica'}
                    </button>
                ))}
            </div>

            {/* Tab: Domanda corrente */}
            {activeTab === 'question' && (
                <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                    <p className="text-sm text-green-600 mb-2">
                        🟢 Domanda {currentIndex} di {questions.length}
                    </p>

                    <h2 className="text-lg font-semibold text-gray-700 mb-2">
                        {currentQuestion?.question || 'Nessuna domanda disponibile'}
                    </h2>

                    {showAudio && currentQuestion?.audioPath && (
                        <div className="mt-4 flex items-center gap-2">
                            <audio ref={audioRef} src={currentQuestion.audioPath} />
                            <span className="text-blue-600 font-medium animate-pulse">Audio in riproduzione...</span>
                        </div>
                    )}

                    {/* Opzioni (per tutti i tipi) */}
                    <ul className="list-disc list-inside text-gray-600 mb-4">
                        {Array.isArray(currentQuestion?.options) &&
                            currentQuestion.options.map((opt: any, idx: number) => (
                                <li key={idx}>{typeof opt === 'string' ? opt : opt?.left ?? JSON.stringify(opt)}</li>
                            ))}
                    </ul>

                    {/* Opzioni right per MATCHING */}
                    {Array.isArray(currentQuestion?.options) &&
                        currentQuestion?.options[0]?.rightOptions && (
                            <ul className="list-disc list-inside text-gray-600 mb-4">
                                {currentQuestion.options[0].rightOptions.map((opt: any, idx: number) => (
                                    <li key={`r-${idx}`}>{typeof opt === 'string' ? opt : JSON.stringify(opt)}</li>
                                ))}
                            </ul>
                        )}

                    <div className="flex items-center gap-3 mt-3 mb-6">
                        <span className="text-gray-600">Tempo rimanente:</span>
                        <span
                            className={`font-semibold ${
                                timeLeft <= 5 ? 'text-red-500' : 'text-[var(--color-secondary)]'
                            }`}
                        >
              {timeLeft}s
            </span>
                    </div>

                    <button
                        onClick={nextQuestion}
                        disabled={timeLeft > 0}
                        className="bg-[var(--color-secondary)] text-white px-4 py-2 rounded-md font-medium hover:bg-[var(--color-secondary-hover)] disabled:bg-gray-300 disabled:cursor-not-allowed transition-all"
                    >
                        {currentIndex === questions.length ? 'Termina quiz' : 'Prossima domanda'}
                    </button>
                </div>
            )}

            {/* Tab: Classifica parziale */}
            {activeTab === 'leaderboard' && (
                <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-700 mb-4">Classifica parziale</h2>

                    {leaderboard.length === 0 ? (
                        <p className="text-gray-500 text-center">Nessun dato disponibile.</p>
                    ) : (
                        <table className="min-w-full border text-sm">
                            <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-2 text-left">#</th>
                                <th className="px-4 py-2 text-left">Utente</th>
                                <th className="px-4 py-2 text-left">Punti</th>
                                <th className="px-4 py-2 text-left">Corrette</th>
                            </tr>
                            </thead>
                            <tbody>
                            {leaderboard.map((row: LeaderboardRow, idx: number) => (
                                <tr
                                    key={`${row.user_name}-${idx}`}
                                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}
                                >
                                    <td className="px-4 py-2">{idx + 1}</td>
                                    <td className="px-4 py-2">{row.user_name}</td>
                                    <td className="px-4 py-2 font-medium">{row.total_points}</td>
                                    <td className="px-4 py-2">{row.correct_answers}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </main>
    );
}