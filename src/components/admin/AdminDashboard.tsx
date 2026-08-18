'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/store/useUserStore';
import contestConfig from '@/data/contest_options.json';
import { getServerClockOffsetMs, nowSynced } from '@/utils/serverClock';

interface ContestState {
    id: string;
    category: string;
    is_active: boolean;
    started_at?: string;
    ended_at?: string;
}

interface QuizState {
    id: string;
    quiz_name: string;
    current_question: number;
    question_start: string;
    question_duration: number;
    is_active: boolean;
    ended_at?: string;
}

type ContestConfig = {
    [key: string]: {
        title: string;
        description: string;
        maxVotes: number;
        pointsPerVote: number[];
        options: string[];
    };
};

const CONTEST_CATEGORIES = Object.keys(contestConfig as ContestConfig);

export default function AdminDashboard() {
    const { user, loading, role } = useAuth();

    const [quizState, setQuizState] = useState<QuizState | null>(null);
    const [contestState, setContestState] = useState<ContestState | null>(null);
    const [questions, setQuestions] = useState<any[]>([]);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showAudio, setShowAudio] = useState(false);
    const [clockOffsetMs, setClockOffsetMs] = useState<number>(0);

    useEffect(() => {
        getServerClockOffsetMs().then(setClockOffsetMs);
    }, []);

    const [activeTab, setActiveTab] = useState<'question' | 'leaderboard'>('question');
    const [inactiveTab, setInactiveTab] = useState<'start' | 'leaderboard' | 'contest'>('start');

    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [lastLeaderboard, setLastLeaderboard] = useState<any[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

    const [availableQuizzes] = useState(['mille_e_una_notte_quiz', 'sultano_quiz']);
    const [selectedQuiz, setSelectedQuiz] = useState(availableQuizzes[0]);

    // Contest UI state
    const [selectedContestToStart, setSelectedContestToStart] = useState<string>(
        (CONTEST_CATEGORIES[0] as string) ?? 'COSPLAY',
    );
    const [selectedContestToView, setSelectedContestToView] = useState<string>(
        (CONTEST_CATEGORIES[0] as string) ?? 'COSPLAY',
    );
    const [contestLeaderboard, setContestLeaderboard] = useState<any[]>([]);
    const [loadingContestLeaderboard, setLoadingContestLeaderboard] = useState(false);
    const [finalContestLeaderboard, setFinalContestLeaderboard] = useState<any[]>([]);
    const [loadingFinalContest, setLoadingFinalContest] = useState(false);
    const channelRef = useRef<any>(null);

    // =======================
    // Stato quiz + contest + realtime
    // =======================
    useEffect(() => {
        let mounted = true;

        const loadStates = async () => {
            const [{ data: quiz, error: quizError }, { data: contest, error: contestError }] =
                await Promise.all([
                    supabase.from('quiz_state').select('*').eq('is_active', true).maybeSingle(),
                    supabase.from('contest_state').select('*').eq('is_active', true).maybeSingle(),
                ]);

            if (quizError) console.error('quiz_state error:', quizError);
            if (contestError) console.error('contest_state error:', contestError);

            if (mounted) {
                setQuizState(quiz ?? null);
                setContestState(contest ?? null);
                setIsLoading(false);
            }
        };

        loadStates();

        const channel = supabase
            .channel('quiz_and_contest_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_state' }, (payload) =>
                setQuizState((payload.new as QuizState)?.is_active ? (payload.new as QuizState) : null),
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'contest_state' },
                (payload) =>
                    setContestState(
                        (payload.new as ContestState)?.is_active ? (payload.new as ContestState) : null,
                    ),
            )
            // Canale "broadcast" a bassissima latenza (in aggiunta a postgres_changes, che rimane
            // come fallback affidabile basato su DB): evita il ritardo dovuto alla replica WAL di
            // Postgres quando si avvia/avanza un quiz o un contest con molti dispositivi collegati.
            .on('broadcast', { event: 'quiz_state' }, (payload) =>
                setQuizState((payload.payload as QuizState)?.is_active ? (payload.payload as QuizState) : null),
            )
            .on('broadcast', { event: 'contest_state' }, (payload) =>
                setContestState(
                    (payload.payload as ContestState)?.is_active ? (payload.payload as ContestState) : null,
                ),
            )
            .subscribe();

        channelRef.current = channel;

        return () => {
            mounted = false;
            supabase.removeChannel(channel);
        };
    }, []);

    // =======================
    // Carica quiz JSON
    // =======================
    useEffect(() => {
        const loadQuiz = async () => {
            try {
                const mod = await import(`@/data/${selectedQuiz}_admin.json`);
                setQuestions(mod.default.questions);
            } catch {
                setQuestions([]);
            }
        };
        loadQuiz();
    }, [selectedQuiz]);

    // =======================
    // Timer quiz
    // =======================
    useEffect(() => {
        if (!quizState?.question_start || !quizState?.question_duration) {
            setTimeLeft(0);
            return;
        }

        const interval = setInterval(() => {
            const start = new Date(quizState.question_start).getTime();
            const elapsed = Math.floor((nowSynced(clockOffsetMs) - start) / 1000);
            const remaining = Math.max(quizState.question_duration - elapsed, 0);
            setTimeLeft(remaining);
        }, 1000);

        return () => clearInterval(interval);
    }, [quizState, clockOffsetMs]);

    // =======================
    // Audio
    // =======================
    const audioRef = useRef<HTMLAudioElement | null>(null);
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

        const el = audioRef.current;
        if (!el) return;

        const t = setTimeout(() => {
            const playPromise = el.play();
            if (playPromise && typeof playPromise.then === 'function') {
                playPromise.catch((err) => {
                    console.warn('Autoplay audio bloccato, usa i controlli manuali.', err);
                });
            }
        }, 500);

        return () => {
            clearTimeout(t);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            setShowAudio(false);
        };
    }, [currentQuestion?.audioPath, quizState?.is_active]);

    // =======================
    // Classifica corrente (quiz attivo)
    // =======================
    useEffect(() => {
        const fetchLeaderboard = async () => {
            if (!quizState?.id) return;
            const { data, error } = await supabase.rpc('get_quiz_leaderboard', {
                p_session_id: quizState.id,
            });
            if (error) {
                console.error('Errore get_quiz_leaderboard:', error);
                return;
            }
            if (data) setLeaderboard(data);
        };
        fetchLeaderboard();
    }, [quizState?.id, quizState?.current_question]);

    // =======================
    // Ultima classifica (quiz concluso)
    // =======================
    useEffect(() => {
        const fetchLastLeaderboard = async () => {
            if (quizState || inactiveTab !== 'leaderboard') return;

            setLoadingLeaderboard(true);
            const { data, error } = await supabase.rpc('get_last_quiz_leaderboard');

            if (error) {
                console.error('Errore get_last_quiz_leaderboard:', error);
                setLastLeaderboard([]);
                setLoadingLeaderboard(false);
                return;
            }

            setLastLeaderboard(data ?? []);
            setLoadingLeaderboard(false);
        };

        fetchLastLeaderboard();
    }, [quizState, inactiveTab]);

    // =======================
    // Classifica contest attivo
    // =======================
    useEffect(() => {
        const fetchContestLeaderboard = async () => {
            if (!contestState?.category) return;

            setLoadingContestLeaderboard(true);
            const { data, error } = await supabase.rpc('get_contest_leaderboard', {
                p_category: contestState.category,
            });

            if (error) {
                console.error('Errore get_contest_leaderboard:', error);
                setContestLeaderboard([]);
                setLoadingContestLeaderboard(false);
                return;
            }

            setContestLeaderboard(data ?? []);
            setLoadingContestLeaderboard(false);
        };

        fetchContestLeaderboard();
    }, [contestState?.category]);

    // =======================
    // Classifica finale contest (quando non c'è nulla attivo)
    // =======================
    useEffect(() => {
        const fetchFinalContestLeaderboard = async () => {
            if (quizState || contestState) return;
            if (inactiveTab !== 'contest') return;

            setLoadingFinalContest(true);
            const { data, error } = await supabase.rpc('get_contest_leaderboard', {
                p_category: selectedContestToView,
            });

            if (error) {
                console.error('Errore get_contest_leaderboard (final):', error);
                setFinalContestLeaderboard([]);
                setLoadingFinalContest(false);
                return;
            }

            setFinalContestLeaderboard(data ?? []);
            setLoadingFinalContest(false);
        };

        fetchFinalContestLeaderboard();
    }, [quizState, contestState, inactiveTab, selectedContestToView]);

    // =======================
    // Avvio quiz / prossima domanda
    // =======================
    const startQuiz = async () => {
        if (contestState) {
            alert('❌ Non puoi avviare un quiz mentre una votazione è attiva.');
            return;
        }

        if (!questions.length) return alert('Quiz non caricato.');
        try {
            await supabase.from('quiz_state').update({ is_active: false }).eq('is_active', true);
            const mod = await import(`@/data/${selectedQuiz}_admin.json`);
            const rows = mod.default.questions.map((q: any) => ({
                quiz_id: selectedQuiz,
                question_id: q.id,
                question_type: q.type,
                correct_options: q.correctAnswers,
                points_base: q.points ?? 0,
                bonus_mode: q.speedBonus?.mode ?? 'none',
                bonus_max: q.speedBonus?.maxBonus ?? 0,
            }));
            await supabase.from('correct_answers').delete().eq('quiz_id', selectedQuiz);
            await supabase.from('correct_answers').insert(rows);

            const { data } = await supabase
                .from('quiz_state')
                .insert({
                    quiz_name: selectedQuiz,
                    current_question: 0,
                    question_start: new Date(nowSynced(clockOffsetMs)).toISOString(),
                    question_duration: mod.default.questions[0].timeLimit ?? 30,
                    is_active: true,
                })
                .select()
                .single();

            setQuizState(data);
            channelRef.current?.send({ type: 'broadcast', event: 'quiz_state', payload: data });
            setTimeLeft(mod.default.questions[0].timeLimit ?? 30);
            setActiveTab('question');
        } catch (err) {
            console.error('Errore avvio quiz:', err);
        }
    };

    const nextQuestion = async () => {
        if (!quizState || !questions.length) return;
        if (timeLeft > 0) return;

        const next = quizState.current_question + 1;

        if (next >= questions.length) {
            await supabase
                .from('quiz_state')
                .update({ is_active: false, ended_at: new Date().toISOString() })
                .eq('id', quizState.id);
            setQuizState(null);
            channelRef.current?.send({ type: 'broadcast', event: 'quiz_state', payload: null });
            setInactiveTab('leaderboard');
            setActiveTab('leaderboard');
            return;
        }

        const nextDuration = questions[next].timeLimit ?? 30;
        setTimeLeft(nextDuration);

        const { data } = await supabase
            .from('quiz_state')
            .update({
                current_question: next,
                question_start: new Date(nowSynced(clockOffsetMs)).toISOString(),
                question_duration: nextDuration,
            })
            .eq('id', quizState.id)
            .select()
            .single();

        setQuizState(data);
        channelRef.current?.send({ type: 'broadcast', event: 'quiz_state', payload: data });
    };

    // =======================
    // Avvio / chiusura contest
    // =======================
    const startContest = async () => {
        if (quizState) {
            alert('❌ Non puoi avviare una votazione mentre un quiz è attivo.');
            return;
        }

        try {
            await supabase.from('contest_state').update({ is_active: false }).eq('is_active', true);

            const { data, error } = await supabase
                .from('contest_state')
                .insert({
                    category: selectedContestToStart,
                    is_active: true,
                })
                .select()
                .single();

            if (error) throw error;

            setContestState(data);
            channelRef.current?.send({ type: 'broadcast', event: 'contest_state', payload: data });
            setContestLeaderboard([]);
        } catch (err) {
            console.error('Errore avvio contest:', err);
        }
    };

    const closeContest = async () => {
        if (!contestState) return;

        try {
            const { error } = await supabase
                .from('contest_state')
                .update({ is_active: false, ended_at: new Date().toISOString() })
                .eq('id', contestState.id);

            if (error) throw error;

            setContestState(null);
            channelRef.current?.send({ type: 'broadcast', event: 'contest_state', payload: null });
            setInactiveTab('contest');
        } catch (err) {
            console.error('Errore chiusura contest:', err);
        }
    };

    // =======================
    // Render
    // =======================
    if (loading || isLoading)
        return <div className="p-6 text-center text-gray-300">Caricamento...</div>;

    if (role !== 'admin') {
        return (
            <div className="p-6 text-center text-white">
                <p className="text-lg">Accesso negato 🚫</p>
                <Link href="/login" className="text-[var(--color-secondary)] hover:underline">
                    Torna al login
                </Link>
            </div>
        );
    }

    // =======================
    // Nessun quiz o contest attivo
    // =======================
    if (!quizState && !contestState) {
        return (
            <main className="max-w-4xl mx-auto p-6">
                <h1 className="text-2xl font-bold text-white mb-6 text-center">Dashboard Admin</h1>

                <div className="flex justify-center mb-6 border-b border-white/20">
                    {['start', 'leaderboard', 'contest'].map((tab) => (
                        <button
                            key={tab}
                            className={`px-4 py-2 font-medium ${
                                inactiveTab === tab
                                    ? 'border-b-2 border-[var(--color-secondary)] text-[var(--color-secondary)]'
                                    : 'text-gray-300 hover:text-white'
                            }`}
                            onClick={() => setInactiveTab(tab as any)}
                        >
                            {tab === 'start'
                                ? 'Avvia nuovo quiz'
                                : tab === 'leaderboard'
                                    ? 'Ultima classifica'
                                    : 'Votazioni'}
                        </button>
                    ))}
                </div>

                {inactiveTab === 'start' && (
                    <div className="bg-white shadow-lg rounded-lg p-8 border border-gray-200 text-center">
                        <h2 className="text-lg font-semibold text-gray-700 mb-4">Nessun quiz attivo</h2>
                        <label className="text-gray-700 font-medium">
                            Seleziona un quiz:
                            <select
                                value={selectedQuiz}
                                onChange={(e) => setSelectedQuiz(e.target.value)}
                                className="m-2 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                            >
                                {availableQuizzes.map((quiz) => (
                                    <option key={quiz} value={quiz}>
                                        {quiz}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            onClick={startQuiz}
                            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-6 py-3 rounded-md font-semibold mt-4 transition-all"
                        >
                            Avvia quiz
                        </button>
                    </div>
                )}

                {inactiveTab === 'leaderboard' && (
                    <div className="bg-white shadow-lg rounded-lg p-8 border border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-700 mb-4">Ultima classifica</h2>
                        {loadingLeaderboard ? (
                            <p className="text-gray-500 text-center">Caricamento...</p>
                        ) : lastLeaderboard.length === 0 ? (
                            <p className="text-gray-500 text-center">
                                Nessun quiz concluso con classifica disponibile.
                            </p>
                        ) : (
                            <table className="min-w-full border border-gray-200 text-sm">
                                <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">#</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Utente</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Punti</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Corrette</th>
                                </tr>
                                </thead>
                                <tbody>
                                {lastLeaderboard.map((row: any, idx: number) => (
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

                {inactiveTab === 'contest' && (
                    <div className="bg-white shadow-lg rounded-lg p-8 border border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-700 mb-6 text-center">Votazioni</h2>

                        {/* Avvia nuova votazione */}
                        <div className="mb-10">
                            <h3 className="text-md font-semibold text-gray-700 mb-2">Avvia nuova votazione</h3>
                            <p className="text-gray-500 mb-3">
                                Seleziona una categoria di contest da avviare. I partecipanti vedranno solo la
                                votazione attiva.
                            </p>
                            <div className="flex flex-wrap items-center gap-3">
                                <label className="text-gray-700 font-medium">
                                    Categoria:
                                    <select
                                        value={selectedContestToStart}
                                        onChange={(e) => setSelectedContestToStart(e.target.value)}
                                        className="ml-2 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    >
                                        {CONTEST_CATEGORIES.map((key) => {
                                            const cfg = (contestConfig as ContestConfig)[key];
                                            return (
                                                <option key={key} value={key}>
                                                    {cfg?.title ?? key}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </label>
                                <button
                                    onClick={startContest}
                                    className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-6 py-2 rounded-md font-semibold transition-all"
                                >
                                    Avvia votazione
                                </button>
                            </div>
                            <p className="text-sm text-gray-500 mt-2">
                                {(contestConfig as ContestConfig)[selectedContestToStart]?.description}
                            </p>
                        </div>

                        {/* Classifica finale contest */}
                        <div>
                            <h3 className="text-md font-semibold text-gray-700 mb-2">Classifica finale contest</h3>
                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                <label className="text-gray-700 font-medium">
                                    Categoria:
                                    <select
                                        value={selectedContestToView}
                                        onChange={(e) => setSelectedContestToView(e.target.value)}
                                        className="ml-2 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                                    >
                                        {CONTEST_CATEGORIES.map((key) => {
                                            const cfg = (contestConfig as ContestConfig)[key];
                                            return (
                                                <option key={key} value={key}>
                                                    {cfg?.title ?? key}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </label>
                            </div>

                            {loadingFinalContest ? (
                                <p className="text-gray-500 text-center">Caricamento classifica...</p>
                            ) : finalContestLeaderboard.length === 0 ? (
                                <p className="text-gray-500 text-center">
                                    Nessuna votazione registrata per questa categoria.
                                </p>
                            ) : (
                                <table className="min-w-full border border-gray-200 text-sm mt-2">
                                    <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-semibold text-gray-600">#</th>
                                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Candidato</th>
                                        <th className="px-4 py-2 text-left font-semibold text-gray-600">Punti</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {finalContestLeaderboard.map((row: any, idx: number) => (
                                        <tr
                                            key={`${row.candidate}-${idx}`}
                                            className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}
                                        >
                                            <td className="px-4 py-2">{idx + 1}</td>
                                            <td className="px-4 py-2">{row.candidate}</td>
                                            <td className="px-4 py-2 font-medium">{row.total_points}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
            </main>
        );
    }

    // =======================
    // Quiz attivo
    // =======================
    if (quizState) {
        const currentIndex = (quizState.current_question ?? 0) + 1;

        return (
            <main className="max-w-4xl mx-auto p-6">
                <h1 className="text-2xl font-bold text-white mb-6">Dashboard Admin</h1>

                <div className="flex mb-6 border-b border-white/20">
                    {['question', 'leaderboard'].map((tab) => (
                        <button
                            key={tab}
                            className={`px-4 py-2 font-medium ${
                                activeTab === tab
                                    ? 'border-b-2 border-[var(--color-secondary)] text-[var(--color-secondary)]'
                                    : 'text-gray-300 hover:text-white'
                            }`}
                            onClick={() => setActiveTab(tab as any)}
                        >
                            {tab === 'question' ? 'Domanda corrente' : 'Classifica'}
                        </button>
                    ))}
                </div>

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
                                <audio ref={audioRef} src={currentQuestion.audioPath} controls />
                            </div>
                        )}

                        <ul className="list-disc list-inside text-gray-600 mb-4">
                            {currentQuestion?.options?.map((opt: any, idx: number) => (
                                <li key={idx}>{typeof opt === 'string' ? opt : opt.left ?? JSON.stringify(opt)}</li>
                            ))}
                        </ul>

                        {timeLeft === 0 && currentQuestion?.answerDescription && (
                            <div className="mt-4 text-sm text-gray-600">
                                <strong>💡 Spiegazione:</strong> {currentQuestion.answerDescription}
                            </div>
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

                {activeTab === 'leaderboard' && (
                    <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-700 mb-4">Classifica parziale</h2>
                        {leaderboard.length === 0 ? (
                            <p className="text-gray-500 text-center">Nessun dato disponibile.</p>
                        ) : (
                            <table className="min-w-full border border-gray-200 text-sm">
                                <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">#</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Utente</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Punti</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Corrette</th>
                                </tr>
                                </thead>
                                <tbody>
                                {leaderboard.map((row: any, idx: number) => (
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

    // =======================
    // Contest attivo
    // =======================
    if (contestState && !quizState) {
        const cfg = (contestConfig as ContestConfig)[contestState.category];

        return (
            <main className="max-w-4xl mx-auto p-6">
                <h1 className="text-2xl font-bold text-white mb-6">Dashboard Admin</h1>

                <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                    <p className="text-sm text-green-600 mb-2">
                        🟢 Votazione attiva: {cfg?.title ?? contestState.category}
                    </p>
                    <p className="text-gray-600 mb-4">{cfg?.description}</p>

                    <h2 className="text-lg font-semibold text-gray-700 mb-3">Classifica provvisoria</h2>
                    {loadingContestLeaderboard ? (
                        <p className="text-gray-500 text-center">Caricamento classifica...</p>
                    ) : contestLeaderboard.length === 0 ? (
                        <p className="text-gray-500 text-center">Nessun voto ricevuto finora.</p>
                    ) : (
                        <table className="min-w-full border border-gray-200 text-sm mb-4">
                            <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">#</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">Candidato</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">Punti</th>
                            </tr>
                            </thead>
                            <tbody>
                            {contestLeaderboard.map((row: any, idx: number) => (
                                <tr
                                    key={`${row.candidate}-${idx}`}
                                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b`}
                                >
                                    <td className="px-4 py-2">{idx + 1}</td>
                                    <td className="px-4 py-2">{row.candidate}</td>
                                    <td className="px-4 py-2 font-medium">{row.total_points}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}

                    <button
                        onClick={closeContest}
                        className="bg-[var(--color-secondary)] text-white px-4 py-2 rounded-md font-medium hover:bg-[var(--color-secondary-hover)] transition-all"
                    >
                        Termina votazione
                    </button>
                </div>
            </main>
        );
    }

    // Fallback (non dovrebbe mai arrivarci)
    return null;
}
