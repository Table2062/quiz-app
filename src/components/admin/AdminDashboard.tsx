'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/store/useUserStore';

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

export default function AdminDashboard() {
    const { user, loading } = useAuth();

    const [role, setRole] = useState<string | null>(null);
    const [quizState, setQuizState] = useState<QuizState | null>(null);
    const [contestState, setContestState] = useState<ContestState | null>(null);
    const [questions, setQuestions] = useState<any[]>([]);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showAudio, setShowAudio] = useState(false);

    const [activeTab, setActiveTab] = useState<'question' | 'leaderboard'>('question');
    const [inactiveTab, setInactiveTab] = useState<'start' | 'leaderboard' | 'contest'>('start');

    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [lastLeaderboard, setLastLeaderboard] = useState<any[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

    const [availableQuizzes] = useState(['quiz1', 'quiz2', 'quiz3']);
    const [selectedQuiz, setSelectedQuiz] = useState('quiz1');

    // =======================
    // Ruolo admin
    // =======================
    useEffect(() => {
        const fetchRole = async () => {
            if (!user) return;
            const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
            setRole(data?.role ?? null);
        };
        fetchRole();
    }, [user]);

    // =======================
    // Stato quiz + contest + realtime
    // =======================
    useEffect(() => {
        let mounted = true;

        const loadStates = async () => {
            const [{ data: quiz }, { data: contest }] = await Promise.all([
                supabase.from('quiz_state').select('*').eq('is_active', true).single(),
                supabase.from('contest_state').select('*').eq('is_active', true).single(),
            ]);

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
                setQuizState((payload.new as QuizState)?.is_active ? (payload.new as QuizState) : null)
            )
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contest_state' }, (payload) =>
                setContestState((payload.new as ContestState)?.is_active ? (payload.new as ContestState) : null)
            )
            .subscribe();

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
            const elapsed = Math.floor((Date.now() - start) / 1000);
            const remaining = Math.max(quizState.question_duration - elapsed, 0);
            setTimeLeft(remaining);
        }, 1000);

        return () => clearInterval(interval);
    }, [quizState]);

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

    // =======================
    // Classifica corrente
    // =======================
    useEffect(() => {
        const fetchLeaderboard = async () => {
            if (!quizState?.id) return;
            const { data } = await supabase.rpc('get_quiz_leaderboard', { p_session_id: quizState.id });
            if (data) setLeaderboard(data);
        };
        fetchLeaderboard();
    }, [quizState?.id, quizState?.current_question]);

    // =======================
    // Avvio / prossima domanda
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
                    question_start: new Date().toISOString(),
                    question_duration: mod.default.questions[0].timeLimit ?? 30,
                    is_active: true,
                })
                .select()
                .single();

            setQuizState(data);
            setActiveTab('question');
        } catch (err) {
            console.error('Errore avvio quiz:', err);
        }
    };

    const nextQuestion = async () => {
        if (!quizState || !questions.length) return;
        const next = quizState.current_question + 1;

        if (next >= questions.length) {
            await supabase
                .from('quiz_state')
                .update({ is_active: false, ended_at: new Date().toISOString() })
                .eq('id', quizState.id);
            setQuizState(null);
            setInactiveTab('leaderboard');
            setActiveTab('leaderboard');
            return;
        }

        const { data } = await supabase
            .from('quiz_state')
            .update({
                current_question: next,
                question_start: new Date().toISOString(),
                question_duration: questions[next].timeLimit ?? 30,
            })
            .eq('id', quizState.id)
            .select()
            .single();
        setQuizState(data);
    };

    // =======================
    // Render
    // =======================
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

    // Nessun quiz o contest attivo
    if (!quizState && !contestState) {
        return (
            <main className="max-w-4xl mx-auto p-6">
                <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">Dashboard Admin</h1>

                <div className="flex justify-center mb-6 border-b border-gray-300">
                    {['start', 'leaderboard', 'contest'].map((tab) => (
                        <button
                            key={tab}
                            className={`px-4 py-2 font-medium ${
                                inactiveTab === tab
                                    ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                                    : 'text-gray-600 hover:text-gray-800'
                            }`}
                            onClick={() => setInactiveTab(tab as any)}
                        >
                            {tab === 'start' ? 'Avvia nuovo quiz' : tab === 'leaderboard' ? 'Ultima classifica' : 'Votazioni'}
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
                                className="ml-2 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
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
            </main>
        );
    }

    // Quiz attivo
    const currentIndex = (quizState?.current_question ?? 0) + 1;

    return (
        <main className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Admin</h1>

            <div className="flex mb-6 border-b border-gray-300">
                {['question', 'leaderboard'].map((tab) => (
                    <button
                        key={tab}
                        className={`px-4 py-2 font-medium ${
                            activeTab === tab
                                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                                : 'text-gray-600 hover:text-gray-800'
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
                            <audio ref={audioRef} src={currentQuestion.audioPath} />
                            <span className="text-blue-600 font-medium animate-pulse">Audio in riproduzione...</span>
                        </div>
                    )}

                    <ul className="list-disc list-inside text-gray-600 mb-4">
                        {currentQuestion?.options?.map((opt: any, idx: number) => (
                            <li key={idx}>{typeof opt === 'string' ? opt : opt.left ?? JSON.stringify(opt)}</li>
                        ))}
                    </ul>

                    <div className="flex items-center gap-3 mt-3 mb-6">
                        <span className="text-gray-600">Tempo rimanente:</span>
                        <span
                            className={`font-semibold ${timeLeft <= 5 ? 'text-red-500' : 'text-[var(--color-secondary)]'}`}
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