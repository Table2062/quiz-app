'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Question } from '@/types/QuestionProps';
import { renderQuestion } from '@/utils/renderQuestion';
import { useAuth } from '@/store/useUserStore';

export default function QuizPageContent() {
    const { user } = useAuth();
    const [quizState, setQuizState] = useState<any>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [submitted, setSubmitted] = useState<boolean>(false);
    const [finalScore, setFinalScore] = useState<number | null>(null);

    // 🔹 Stato contest (nuovo)
    const [contestState, setContestState] = useState<any>(null);
    const [contestOptions, setContestOptions] = useState<any>(null);
    const [contestVotes, setContestVotes] = useState<string[]>([]);
    const [contestSubmitted, setContestSubmitted] = useState(false);

    // ==============================================================
    // 🔹 Recupera quiz_state attivo e contest_state attivo
    // ==============================================================
    useEffect(() => {
        const fetchStates = async () => {
            try {
                const [{ data: quiz }, { data: contest }] = await Promise.all([
                    supabase.from('quiz_state').select('*').eq('is_active', true).single(),
                    supabase.from('contest_state').select('*').eq('is_active', true).single(),
                ]);

                setQuizState(quiz ?? null);
                setContestState(contest ?? null);
                setLoading(false);

                if (!quiz && !contest) {
                    fetchLastSessionScore();
                }
            } catch (err) {
                console.error('Errore fetchStates:', err);
                setLoading(false);
            }
        };

        fetchStates();

        const quizChannel = supabase
            .channel('quiz_state_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_state' }, (payload) => {
                if (payload.eventType === 'UPDATE' && payload.new?.is_active === false) {
                    const endedSessionId = payload.new.id;
                    setQuizState(null);
                    setFinalScore(null);
                    fetchFinalScore(endedSessionId);
                } else if (payload.eventType === 'INSERT' && payload.new?.is_active) {
                    setFinalScore(null);
                    setQuizState(payload.new);
                } else if (payload.eventType === 'UPDATE' && payload.new?.is_active) {
                    setQuizState(payload.new);
                } else if (payload.eventType === 'DELETE') {
                    setQuizState(null);
                }
            })
            .subscribe();

        // 🧩 Cleanup sincrona (NON async)
        return () => {
            supabase.removeChannel(quizChannel);
        };
    }, []);

    // ==============================================================
    // 🔹 Carica quiz JSON
    // ==============================================================
    useEffect(() => {
        if (!quizState?.quiz_name) return;
        const loadQuiz = async () => {
            try {
                const res = await fetch(`/data/${quizState.quiz_name}.json?ts=${Date.now()}`);
                const json = await res.json();
                setQuestions(json.questions);
            } catch {
                setQuestions([]);
            }
        };
        loadQuiz();
    }, [quizState?.quiz_name]);

    // ==============================================================
    // 🔹 Timer e domanda corrente
    // ==============================================================
    useEffect(() => {
        if (!quizState || !questions.length) return;
        const q = questions[quizState.current_question];
        setCurrentQuestion(q);
        setSubmitted(false);

        const start = new Date(quizState.question_start).getTime();
        const duration = quizState.question_duration * 1000;

        const tick = () => {
            const diff = Math.max(0, Math.floor((start + duration - Date.now()) / 1000));
            setTimeLeft(diff);
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [quizState?.current_question, quizState?.question_start, quizState?.question_duration, questions]);

    // ==============================================================
    // 🔹 Salva risposta quiz
    // ==============================================================
    const handleAnswer = async (answer: any) => {
        if (!quizState || !currentQuestion || !user || submitted) return;
        setSubmitted(true);
        await supabase.from('answers').insert({
            user_id: user.id,
            quiz_id: quizState.quiz_name,
            question_id: currentQuestion.id,
            selected_options: answer,
            session_id: quizState.id,
        });
    };

    // ==============================================================
    // 🔹 Recupero punteggi (quiz)
    // ==============================================================
    const fetchFinalScore = async (sessionId: string) => {
        if (!user || !sessionId) return;
        const { data } = await supabase
            .from('answers')
            .select('points_awarded')
            .eq('user_id', user.id)
            .eq('session_id', sessionId);
        const total = (data ?? []).reduce((s, r) => s + (r.points_awarded ?? 0), 0);
        setFinalScore(total);
    };

    const fetchLastSessionScore = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('answers')
            .select('session_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1);
        if (data?.[0]?.session_id) fetchFinalScore(data[0].session_id);
    };

    // ==============================================================
    // 🔹 Carica contest attivo
    // ==============================================================
    useEffect(() => {
        if (!contestState?.category) return;
        const loadContest = async () => {
            try {
                const res = await fetch(`/data/contest_options.json?ts=${Date.now()}`);
                const json = await res.json();
                setContestOptions(json[contestState.category]);
            } catch (err) {
                console.error('Errore caricamento contest:', err);
            }
        };
        loadContest();
    }, [contestState?.category]);

    // ==============================================================
    // 🔹 Gestione voto contest
    // ==============================================================
    const handleContestVote = async () => {
        if (!contestState?.category || !user || contestSubmitted) return;
        if (contestVotes.length === 0) return alert('Seleziona almeno un partecipante!');
        const points = contestOptions.pointsPerVote;
        try {
            const rows = contestVotes.map((candidate, idx) => ({
                user_id: user.id,
                category: contestState.category,
                position: idx + 1,
                candidate,
                points: points[idx] ?? 0,
            }));
            await supabase.from('contest_votes').insert(rows);
            setContestSubmitted(true);
        } catch (err) {
            console.error('Errore voto contest:', err);
        }
    };

    // ==============================================================
    // 🔹 UI: caricamento
    // ==============================================================
    if (loading) {
        return (
            <main className="flex items-center justify-center h-screen text-gray-500">
                Caricamento...
            </main>
        );
    }

    // ==============================================================
    // 🔹 Nessun quiz o contest attivo
    // ==============================================================
    if (!quizState && !contestState) {
        return (
            <main className="flex flex-col items-center justify-center h-screen text-center">
                {finalScore != null ? (
                    <>
                        <h1 className="text-2xl font-semibold text-gray-800 mb-3">
                            🎉 Quiz completato!
                        </h1>
                        <p className="text-xl font-bold text-green-600 mb-2">
                            Hai totalizzato {finalScore} punti
                        </p>
                        <p className="text-gray-500">
                            Attendi che l’amministratore avvii un nuovo quiz o una votazione.
                        </p>
                    </>
                ) : (
                    <>
                        <h1 className="text-2xl font-semibold text-gray-800 mb-3">
                            Nessuna attività attiva
                        </h1>
                        <p className="text-gray-500">
                            Attendi che l’amministratore avvii un quiz o una votazione.
                        </p>
                    </>
                )}
            </main>
        );
    }

    // ==============================================================
    // 🔹 Contest attivo (nuovo blocco)
    // ==============================================================
    if (contestState && contestOptions) {
        const isMulti = contestOptions.maxVotes > 1;
        const handleSelect = (candidate: string) => {
            if (contestSubmitted) return;
            setContestVotes((prev) => {
                if (isMulti) {
                    if (prev.includes(candidate))
                        return prev.filter((c) => c !== candidate);
                    if (prev.length < contestOptions.maxVotes)
                        return [...prev, candidate];
                    return prev;
                } else {
                    return [candidate];
                }
            });
        };

        return (
            <main className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-md rounded-lg text-center">
                <h1 className="text-2xl font-bold mb-2">{contestOptions.title}</h1>
                <p className="text-gray-600 mb-6">{contestOptions.description}</p>

                <div className="flex flex-col gap-2 mb-6">
                    {contestOptions.options.map((candidate: string) => (
                        <button
                            key={candidate}
                            onClick={() => handleSelect(candidate)}
                            disabled={contestSubmitted}
                            className={`px-4 py-2 rounded-md border transition-all ${
                                contestVotes.includes(candidate)
                                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                                    : 'border-gray-300 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                            }`}
                        >
                            {candidate}
                        </button>
                    ))}
                </div>

                {!contestSubmitted ? (
                    <button
                        onClick={handleContestVote}
                        className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-6 py-3 rounded-md font-semibold transition-all"
                    >
                        Invia voto
                    </button>
                ) : (
                    <p className="text-green-600 font-semibold">✅ Voto registrato!</p>
                )}
            </main>
        );
    }

    // ==============================================================
    // 🔹 Quiz attivo (default)
    // ==============================================================
    if (!currentQuestion) {
        return (
            <main className="flex items-center justify-center h-screen">
                <p className="text-gray-500">Caricamento domanda...</p>
            </main>
        );
    }

    return (
        <main className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-md rounded-lg">
            <div className="flex justify-between items-center mb-4">
                <div
                    className={`font-medium ${
                        timeLeft <= 5 ? 'text-red-600' : 'text-gray-600'
                    }`}
                >
                    ⏱️ {timeLeft}s
                </div>
            </div>

            {renderQuestion(currentQuestion, {
                onAnswer: handleAnswer,
                disabled: timeLeft <= 0 || submitted,
            })}

            {submitted && (
                <p className="text-center text-green-600 mt-4 font-medium">
                    ✅ Risposta registrata
                </p>
            )}
        </main>
    );
}