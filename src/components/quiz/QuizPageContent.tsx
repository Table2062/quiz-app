'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { renderQuestion } from '@/utils/renderQuestion';
import { useAuth } from '@/store/useUserStore';
import { Question } from '@/types/QuestionProps';

interface ContestOption {
    DESSERT: string[];
    COSPLAY: string[];
}

export default function QuizPageContent() {
    const { user } = useAuth();
    const [quizState, setQuizState] = useState<any | null>(null);
    const [contestState, setContestState] = useState<any | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [submitted, setSubmitted] = useState<boolean>(false);
    const [finalScore, setFinalScore] = useState<number | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    // Contest
    const [contestOptions, setContestOptions] = useState<ContestOption | null>(null);
    const [contestVotes, setContestVotes] = useState<string[]>([]);
    const [voteSubmitted, setVoteSubmitted] = useState<boolean>(false);

    // ============================================================
    // 🔹 Carica quiz_state e contest_state + realtime
    // ============================================================
    useEffect(() => {
        const fetchStates = async () => {
            const [{ data: quiz }, { data: contest }] = await Promise.all([
                supabase.from('quiz_state').select('*').eq('is_active', true).single(),
                supabase.from('contest_state').select('*').eq('is_active', true).single(),
            ]);

            setQuizState(quiz ?? null);
            setContestState(contest ?? null);
            setLoading(false);

            if (!quiz && !contest) fetchLastSessionScore();
        };

        fetchStates();

        const channel = supabase
            .channel('quiz_contest_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_state' }, (payload) => {
                const newState = payload.new as Record<string, any> | null;
                setQuizState(newState && newState.is_active ? newState : null);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'contest_state' }, (payload) => {
                const newState = payload.new as Record<string, any> | null;
                setContestState(newState && newState.is_active ? newState : null);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // ============================================================
    // 🔹 Carica quiz JSON
    // ============================================================
    useEffect(() => {
        const loadQuiz = async () => {
            if (!quizState?.quiz_name) return;
            try {
                const res = await fetch(`/data/${quizState.quiz_name}.json?ts=${Date.now()}`);
                if (!res.ok) throw new Error('Quiz non trovato');
                const json = await res.json();
                setQuestions(json.questions);
            } catch (err) {
                console.error('Errore caricamento quiz:', err);
                setQuestions([]);
            }
        };
        loadQuiz();
    }, [quizState?.quiz_name]);

    // ============================================================
    // 🔹 Imposta domanda corrente e timer
    // ============================================================
    useEffect(() => {
        if (!quizState || !questions.length) return;

        const q = questions[quizState.current_question];
        setCurrentQuestion(q);
        setSubmitted(false);

        const start = new Date(quizState.question_start).getTime();
        const duration = quizState.question_duration * 1000;

        const tick = () => {
            const now = Date.now();
            const diff = Math.max(0, Math.floor((start + duration - now) / 1000));
            setTimeLeft(diff);
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [quizState?.current_question, quizState?.question_start, quizState?.question_duration, questions]);

    // ============================================================
    // 🔹 Invia risposta quiz
    // ============================================================
    const handleAnswer = async (answer: any) => {
        if (!quizState || !currentQuestion || !user || submitted) return;
        setSubmitted(true);

        try {
            const { error } = await supabase.from('answers').insert({
                user_id: user.id,
                quiz_id: quizState.quiz_name,
                question_id: currentQuestion.id,
                selected_options: answer,
                session_id: quizState.id,
            });

            if (error) console.error('Errore salvataggio risposta:', error);
        } catch (err) {
            console.error('Errore invio risposta:', err);
        }
    };

    // ============================================================
    // 🔹 Recupera punteggio finale quiz
    // ============================================================
    const fetchFinalScore = async (sessionId: string) => {
        if (!user || !sessionId) return;
        const { data } = await supabase
            .from('answers')
            .select('points_awarded')
            .eq('user_id', user.id)
            .eq('session_id', sessionId);

        const total = (data ?? []).reduce((sum, r) => sum + (r.points_awarded ?? 0), 0);
        setFinalScore(total > 0 ? total : 0);
    };

    const fetchLastSessionScore = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('answers')
            .select('session_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (data && data[0]?.session_id) fetchFinalScore(data[0].session_id);
    };

    // ============================================================
    // 🔹 Carica opzioni contest
    // ============================================================
    useEffect(() => {
        const loadOptions = async () => {
            try {
                const res = await fetch('/data/contest_options.json');
                const json = await res.json();
                setContestOptions(json);
            } catch (e) {
                console.error('Errore caricamento contest_options.json', e);
            }
        };
        loadOptions();
    }, []);

    // ============================================================
    // 🔹 Invia voto contest
    // ============================================================
    const handleVote = async () => {
        if (!user || !contestState?.category || voteSubmitted) return;

        try {
            const category = contestState.category;
            const votesToInsert =
                category === 'DESSERT'
                    ? [{ user_id: user.id, category, candidate: contestVotes[0], points: 12 }]
                    : [
                        { user_id: user.id, category, candidate: contestVotes[0], points: 12 },
                        { user_id: user.id, category, candidate: contestVotes[1], points: 10 },
                        { user_id: user.id, category, candidate: contestVotes[2], points: 8 },
                    ];

            const { error } = await supabase.from('contest_votes').insert(votesToInsert);
            if (error) throw error;
            setVoteSubmitted(true);
        } catch (err) {
            console.error('Errore invio voti contest:', err);
        }
    };

    // ============================================================
    // 🔹 UI di caricamento
    // ============================================================
    if (loading)
        return (
            <main className="flex items-center justify-center h-screen text-gray-500">
                Caricamento...
            </main>
        );

    // ============================================================
    // 🔹 Caso: contest attivo
    // ============================================================
    if (contestState && contestOptions) {
        const category = contestState.category as keyof ContestOption;
        const options = contestOptions[category] || [];

        const handleSelect = (candidate: string) => {
            if (voteSubmitted) return;

            if (category === 'DESSERT') {
                setContestVotes([candidate]);
            } else {
                let updated = [...contestVotes];
                if (updated.includes(candidate)) {
                    updated = updated.filter((v) => v !== candidate);
                } else if (updated.length < 3) {
                    updated.push(candidate);
                }
                setContestVotes(updated);
            }
        };

        const getRankLabel = (idx: number) => ['🥇 1°', '🥈 2°', '🥉 3°'][idx];

        return (
            <main className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-md rounded-lg text-center">
                <h1 className="text-2xl font-semibold text-gray-800 mb-4">
                    {category === 'DESSERT' ? '🍰 Dessert Contest' : '🎭 Cosplay Contest'}
                </h1>
                <p className="text-gray-500 mb-6">
                    {category === 'DESSERT'
                        ? 'Scegli il tuo dessert preferito!'
                        : 'Scegli i tuoi 3 cosplay preferiti (1°, 2°, 3° posto).'}
                </p>

                <div className="flex flex-col gap-3 mb-6">
                    {options.map((opt) => {
                        const idx = contestVotes.indexOf(opt);
                        const selected = idx !== -1;
                        return (
                            <button
                                key={opt}
                                onClick={() => handleSelect(opt)}
                                disabled={voteSubmitted}
                                className={`px-4 py-3 rounded-lg border transition-all ${
                                    selected
                                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                                        : 'border-gray-300 text-gray-700 hover:border-[var(--color-primary)]'
                                }`}
                            >
                                {opt}
                                {selected && category === 'COSPLAY' && (
                                    <span className="ml-2 text-sm opacity-80">{getRankLabel(idx)}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {!voteSubmitted ? (
                    <button
                        disabled={
                            (category === 'DESSERT' && contestVotes.length !== 1) ||
                            (category === 'COSPLAY' && contestVotes.length !== 3)
                        }
                        onClick={handleVote}
                        className="bg-[var(--color-primary)] text-white font-semibold px-6 py-3 rounded-md hover:bg-[var(--color-primary-hover)] disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        Invia voto
                    </button>
                ) : (
                    <p className="text-green-600 font-medium mt-4">✅ Voto registrato con successo!</p>
                )}
            </main>
        );
    }

    // ============================================================
    // 🔹 Caso: nessun quiz né contest
    // ============================================================
    if (!quizState)
        return (
            <main className="flex flex-col items-center justify-center h-screen text-center">
                {finalScore != null ? (
                    <>
                        <h1 className="text-2xl font-semibold text-gray-800 mb-3">🎉 Quiz completato!</h1>
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
                            Nessun quiz o contest attivo
                        </h1>
                        <p className="text-gray-500">
                            Attendi che l’amministratore avvii una sessione o una votazione.
                        </p>
                    </>
                )}
            </main>
        );

    // ============================================================
    // 🔹 Caso: quiz attivo
    // ============================================================
    if (!currentQuestion)
        return (
            <main className="flex items-center justify-center h-screen">
                <p className="text-gray-500">Caricamento domanda...</p>
            </main>
        );

    return (
        <main className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-md rounded-lg">
            <div className="flex justify-between items-center mb-4">
                <div className={`font-medium ${timeLeft <= 5 ? 'text-red-600' : 'text-gray-600'}`}>
                    ⏱️ {timeLeft}s
                </div>
            </div>

            {renderQuestion(currentQuestion, {
                onAnswer: handleAnswer,
                disabled: timeLeft <= 0 || submitted,
            })}

            {submitted && (
                <p className="text-center text-green-600 mt-4 font-medium">✅ Risposta registrata</p>
            )}
        </main>
    );
}