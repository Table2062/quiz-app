'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/store/useUserStore';

export default function AdminDashboard() {
    const { user, loading } = useAuth();
    const [role, setRole] = useState<string | null>(null);
    const [quizState, setQuizState] = useState<any | null>(null);
    const [questions, setQuestions] = useState<any[]>([]);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showAudio, setShowAudio] = useState(false);
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'question' | 'leaderboard'>('question');

    const [availableQuizzes] = useState<string[]>(['quiz1', 'quiz2', 'quiz3']);
    const [selectedQuiz, setSelectedQuiz] = useState<string>('quiz1');
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 🔹 Recupera ruolo admin
    useEffect(() => {
        const fetchRole = async () => {
            if (!user) return;
            const { data } = await supabase
                .from('users')
                .select('role')
                .eq('id', user.id)
                .single();
            setRole(data?.role ?? null);
        };
        fetchRole();
    }, [user]);

    // 🔹 Carica il file JSON del quiz selezionato (admin version)
    useEffect(() => {
        const loadQuiz = async () => {
            try {
                const mod = await import(`@/data/${selectedQuiz}_admin.json`);
                setQuestions(mod.default.questions);
            } catch (err) {
                console.error('Errore nel caricamento del quiz:', err);
                setQuestions([]);
            }
        };
        loadQuiz();
    }, [selectedQuiz]);

    // 🔹 Recupera stato quiz e attiva realtime
    useEffect(() => {
        const loadState = async () => {
            const { data } = await supabase
                .from('quiz_state')
                .select('*')
                .eq('is_active', true)
                .single();
            setQuizState(data ?? null);
            setIsLoading(false);
        };

        loadState();

        const channel = supabase
            .channel('quiz_state_updates')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quiz_state' }, (payload) =>
                setQuizState(payload.new)
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // 🔹 Timer sincronizzato
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

    // 🔹 Aggiorna classifica
    useEffect(() => {
        if (!quizState?.id) return;

        const loadLeaderboard = async () => {
            const { data, error } = await supabase.rpc('get_quiz_leaderboard', {
                p_session_id: quizState.id,
            });
            if (!error && data) setLeaderboard(data);
        };

        const shouldUpdate =
            (quizState.current_question + 1) % 5 === 0 || !quizState.is_active;

        if (shouldUpdate) loadLeaderboard();

        const poll = setInterval(loadLeaderboard, 30000);
        return () => clearInterval(poll);
    }, [quizState?.current_question, quizState?.is_active]);

    // ==========================================================
    // 🔹 Funzione per popolare correct_answers
    // ==========================================================
    const uploadCorrectAnswers = async (quizName: string) => {
        try {
            const mod = await import(`@/data/${quizName}_admin.json`);
            const data = mod.default;
            if (!data?.questions?.length) throw new Error('Nessuna domanda trovata.');

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
            const { error } = await supabase.from('correct_answers').insert(rows);
            if (error) throw error;
        } catch (err) {
            console.error('Errore caricamento risposte corrette:', err);
        }
    };

    // ==========================================================
    // 🔹 Avvia quiz
    // ==========================================================
    const startQuiz = async () => {
        if (!questions.length) return alert('Quiz non caricato.');
        try {
            await supabase.from('quiz_state').update({ is_active: false }).eq('is_active', true);
            await uploadCorrectAnswers(selectedQuiz);

            const { data, error } = await supabase
                .from('quiz_state')
                .insert({
                    quiz_name: selectedQuiz,
                    current_question: 0,
                    question_start: new Date().toISOString(),
                    question_duration: questions[0].timeLimit ?? 30,
                    is_active: true,
                })
                .select()
                .single();

            if (error) throw error;
            setQuizState(data);
        } catch (err) {
            console.error('Errore creazione quiz:', err);
        }
    };

    // 🔹 Prossima domanda
    const nextQuestion = async () => {
        if (!quizState || !questions.length) return;
        const next = quizState.current_question + 1;

        if (next >= questions.length) {
            const { data, error } = await supabase
                .from('quiz_state')
                .update({
                    is_active: false,
                    ended_at: new Date().toISOString(),
                })
                .eq('id', quizState.id)
                .select()
                .single();

            if (error) {
                console.error('Errore chiusura quiz:', error);
                return;
            }

            setQuizState(data);
            return;
        }

        const { data, error } = await supabase
            .from('quiz_state')
            .update({
                current_question: next,
                question_start: new Date().toISOString(),
                question_duration: questions[next].timeLimit ?? 30,
            })
            .eq('id', quizState.id)
            .select()
            .single();

        if (error) {
            console.error('Errore aggiornamento domanda:', error);
            return;
        }

        setQuizState(data);
    };

    // ==========================================================
    // 🔹 Rendering
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

    const currentIndex = ((quizState?.current_question ?? -1) + 1);
    const currentQuestion =
        questions.length && quizState?.current_question != null
            ? questions[quizState.current_question]
            : null;

    return (
        <main className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Admin</h1>

            {/* Tabs */}
            <div className="flex mb-4 border-b border-gray-300">
                <button
                    className={`px-4 py-2 font-medium ${
                        activeTab === 'question'
                            ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                            : 'text-gray-600 hover:text-gray-800'
                    }`}
                    onClick={() => setActiveTab('question')}
                >
                    Domanda corrente
                </button>
                <button
                    className={`ml-4 px-4 py-2 font-medium ${
                        activeTab === 'leaderboard'
                            ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                            : 'text-gray-600 hover:text-gray-800'
                    }`}
                    onClick={() => setActiveTab('leaderboard')}
                >
                    Classifica
                </button>
            </div>

            {/* TAB 1: DOMANDA */}
            {activeTab === 'question' && quizState?.is_active && (
                <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-700 mb-2">
                        Domanda {currentIndex} di {questions.length}
                    </h2>
                    <p className="text-gray-600 mb-4">{currentQuestion?.question}</p>

                    {showAudio && currentQuestion?.audioPath && (
                        <div className="mt-4 flex items-center gap-2">
                            <audio ref={audioRef} src={currentQuestion.audioPath} />
                            <div className="flex items-center text-blue-600 font-medium animate-pulse">
                                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2 animate-bounce"></span>
                                Audio in riproduzione...
                            </div>
                        </div>
                    )}

                    <ul className="list-disc list-inside text-gray-600 mb-4">
                        {currentQuestion?.options?.map((opt: any, idx: number) => (
                            <li key={idx}>{typeof opt === 'string' ? opt : JSON.stringify(opt)}</li>
                        ))}
                    </ul>

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

            {/* TAB 2: CLASSIFICA */}
            {activeTab === 'leaderboard' && (
                <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-700 mb-4">
                        {quizState?.is_active ? 'Classifica parziale' : 'Classifica finale'}
                    </h2>

                    {leaderboard.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">
                            Nessun dato disponibile
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
                            {leaderboard.map((row, idx) => (
                                <tr
                                    key={row.user_id}
                                    className={`${
                                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                    } border-b`}
                                >
                                    <td className="px-4 py-2">{idx + 1}</td>
                                    <td className="px-4 py-2">{row.user_id}</td>
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