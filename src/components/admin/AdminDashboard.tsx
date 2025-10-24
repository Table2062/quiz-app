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

    // 🔹 Multi-quiz
    const [availableQuizzes] = useState<string[]>(['quiz1', 'quiz2', 'quiz3']);
    const [selectedQuiz, setSelectedQuiz] = useState<string>('quiz1');

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
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'quiz_state' },
                (payload) => setQuizState(payload.new)
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

    // 🔊 Audio management
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

        const playTimeout = setTimeout(() => {
            audioRef.current?.play().catch(() => {
                console.warn('Audio non riproducibile automaticamente (autoplay limit).');
            });
        }, 1000);

        const stopTimeout = setTimeout(() => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            setShowAudio(false);
        }, (currentQuestion.timeLimit ?? 0) * 1000);

        return () => {
            clearTimeout(playTimeout);
            clearTimeout(stopTimeout);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            setShowAudio(false);
        };
    }, [currentQuestion, quizState?.is_active]);

    // ==========================================================
    // 🔹 Funzione per popolare correct_answers da quiz_admin.json
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
                bonus_max: q.speedBonus?.maxBonus ?? 0
            }));

            // Cancella risposte precedenti di quello stesso quiz
            await supabase.from('correct_answers').delete().eq('quiz_id', quizName);

            const { error } = await supabase.from('correct_answers').insert(rows);
            if (error) throw error;
        } catch (err) {
            console.error('Errore caricamento risposte corrette:', err);
        }
    };

    // ==========================================================
    // 🔹 Avvia un nuovo quiz (crea sessione + popola correct_answers)
    // ==========================================================
    const startQuiz = async () => {
        if (!questions.length) return alert('Quiz non caricato.');

        try {
            // Chiude eventuali sessioni precedenti
            await supabase.from('quiz_state').update({ is_active: false }).eq('is_active', true);

            // Popola risposte corrette PRIMA di creare la sessione
            await uploadCorrectAnswers(selectedQuiz);

            // Crea nuova sessione
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

    // 🔹 Passa alla prossima domanda o chiudi quiz
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

    // 🔸 Nessun quiz attivo
    if (!quizState) {
        return (
            <main className="max-w-4xl mx-auto p-6 text-center">
                <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Admin</h1>
                <div className="bg-white shadow-lg rounded-lg p-8 border border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-700 mb-4">Nessun quiz attivo</h2>
                    <p className="text-gray-600 mb-6">
                        Seleziona un quiz dal menu qui sotto e avvialo per iniziare una nuova sessione.
                    </p>

                    <div className="flex flex-col items-center gap-4">
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
                            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-6 py-3 rounded-md font-semibold transition-all"
                        >
                            Avvia quiz
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    // 🔸 Quiz terminato
    if (!quizState.is_active) {
        return (
            <main className="max-w-4xl mx-auto p-6 text-center">
                <h1 className="text-2xl font-bold text-gray-800 mb-4">Quiz dashboard</h1>
                <div className="bg-white shadow-lg rounded-lg p-8 border border-gray-200">
                    <h2 className="text-xl font-semibold text-green-600 mb-2">✅ Quiz completato!</h2>
                    <p className="text-gray-600 mb-6">
                        Il quiz <span className="font-semibold text-gray-800">{quizState.quiz_name}</span> è
                        terminato. Puoi avviarne un altro quando vuoi.
                    </p>
                    <button
                        onClick={() => setQuizState(null)}
                        className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-6 py-3 rounded-md font-medium transition-all"
                    >
                        Avvia nuovo quiz
                    </button>
                </div>
            </main>
        );
    }

    // 🔸 Quiz attivo
    const currentIndex = quizState.current_question + 1;

    return (
        <main className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Quiz dashboard</h1>

            <p className="text-sm text-green-600 mb-4">
                🟢 Quiz attivo — Domanda {currentIndex} di {questions.length}
            </p>

            <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-700 mb-2">
                    {currentQuestion?.question || 'Nessuna domanda disponibile.'}
                </h2>

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
                        <li key={idx}>{typeof opt === 'string' ? opt : opt.left ? `${opt.left}` : JSON.stringify(opt)}</li>
                    ))}
                </ul>
                {currentQuestion?.options[0]?.rightOptions && currentQuestion?.options[0]?.rightOptions.map((opt: any, idx: number) => (
                    <li key={idx}>{typeof opt === 'string' ? opt : JSON.stringify(opt)}</li>
                ))}

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
        </main>
    );
}