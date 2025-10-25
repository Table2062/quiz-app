'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Question } from '@/types/QuestionProps';
import { renderQuestion } from '@/utils/renderQuestion';
import { useAuth } from '@/store/useUserStore';

// =============================
// Tipi di supporto
// =============================
interface ContestState {
    id: string;
    category: 'DESSERT' | 'COSPLAY';
    is_active: boolean;
    started_at: string;
    ended_at?: string | null;
}

interface VoteCandidate {
    candidate: string;
    points: number;
}

export default function QuizPageContent() {
    const { user } = useAuth();

    // Stato quiz e contest
    const [quizState, setQuizState] = useState<any | null>(null);
    const [contestState, setContestState] = useState<ContestState | null>(null);

    // Quiz
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [submitted, setSubmitted] = useState<boolean>(false);
    const [finalScore, setFinalScore] = useState<number | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    // Contest
    const [selectedDessert, setSelectedDessert] = useState<string | null>(null);
    const [selectedCosplay, setSelectedCosplay] = useState<string[]>([]);
    const [voteSubmitted, setVoteSubmitted] = useState<boolean>(false);
    const [userVotes, setUserVotes] = useState<VoteCandidate[] | null>(null);

    const dessertOptions = ['Pepa e Igni', 'Luca', 'Eugenia e Maurizio'];
    const cosplayOptions = [
        'Pepa',
        'Davide',
        'Chiara',
        'Ignazio',
        'Luca Moon',
        'Alessio',
        'Marianna',
        'Eugenia',
        'Maurizio',
        'Flavio',
        'Mate',
        'Ginger',
    ];

    // ==============================================================
    // 🔹 Recupera quiz_state e contest_state attivi
    // ==============================================================
    useEffect(() => {
        const fetchStates = async () => {
            const [{ data: quiz }, { data: contest }] = await Promise.all([
                supabase.from('quiz_state').select('*').eq('is_active', true).single(),
                supabase.from('contest_state').select('*').eq('is_active', true).single(),
            ]);

            setQuizState(quiz ?? null);
            setContestState(contest ?? null);
            setLoading(false);
        };

        fetchStates();

        // ✅ realtime fix tipizzato
        interface RealtimePayload {
            new?: Record<string, any> | null;
            old?: Record<string, any> | null;
            eventType: string;
        }

        const quizChannel = supabase
            .channel('quiz_state_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'quiz_state' },
                (payload: RealtimePayload) => {
                    const newRow = payload.new as { is_active?: boolean } | null;
                    setQuizState(newRow?.is_active ? newRow : null);
                }
            )
            .subscribe();

        const contestChannel = supabase
            .channel('contest_state_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'contest_state' },
                (payload: RealtimePayload) => {
                    const newRow = payload.new as { is_active?: boolean } | null;
                    setContestState(newRow?.is_active ? (newRow as ContestState) : null);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(quizChannel);
            supabase.removeChannel(contestChannel);
        };
    }, []);

    // ==============================================================
    // 🔹 Carica quiz JSON
    // ==============================================================
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
            }
        };
        loadQuiz();
    }, [quizState?.quiz_name]);

    // ==============================================================
    // 🔹 Imposta domanda corrente + timer
    // ==============================================================
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

    // ==============================================================
    // 🔹 Gestione risposta quiz
    // ==============================================================
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

    // ==============================================================
    // 🔹 Controlla se utente ha già votato nel contest attivo
    // ==============================================================
    useEffect(() => {
        const checkExistingVote = async () => {
            if (!user || !contestState) return;

            const { data } = await supabase.rpc('get_user_contest_vote', {
                p_user_id: user.id,
                p_category: contestState.category,
            });

            if (data && data.length > 0) {
                setVoteSubmitted(true);
                setUserVotes(data[0].votes_with_points ?? null);
            } else {
                setVoteSubmitted(false);
                setUserVotes(null);
            }
        };

        checkExistingVote();
    }, [contestState, user]);

    // ==============================================================
    // 🔹 Invio votazione contest
    // ==============================================================
    const handleSubmitVote = async () => {
        if (!user || !contestState) return;

        try {
            let votes: string[] = [];
            let votesWithPoints: VoteCandidate[] = [];

            if (contestState.category === 'DESSERT' && selectedDessert) {
                votes = [selectedDessert];
                votesWithPoints = [{ candidate: selectedDessert, points: 12 }];
            }

            if (contestState.category === 'COSPLAY' && selectedCosplay.length === 3) {
                votes = selectedCosplay;
                votesWithPoints = [
                    { candidate: selectedCosplay[0], points: 12 },
                    { candidate: selectedCosplay[1], points: 10 },
                    { candidate: selectedCosplay[2], points: 8 },
                ];
            }

            const { error } = await supabase.from('contest_votes').upsert({
                user_id: user.id,
                category: contestState.category,
                contest_id: contestState.id,
                votes,
                votes_with_points: votesWithPoints,
            });

            if (error) throw error;
            setVoteSubmitted(true);
            setUserVotes(votesWithPoints);
        } catch (err) {
            console.error('Errore invio votazione:', err);
        }
    };

    // ==============================================================
    // 🔹 Render
    // ==============================================================
    if (loading) {
        return <main className="flex items-center justify-center h-screen text-gray-500">Caricamento...</main>;
    }

    // --- Caso 1: contest attivo ---
    if (contestState?.is_active) {
        return (
            <main className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-md rounded-lg text-center">
                <h1 className="text-2xl font-semibold text-gray-800 mb-4">
                    🗳️ Votazione {contestState.category}
                </h1>

                {voteSubmitted && userVotes ? (
                    <>
                        <p className="text-green-600 font-medium text-lg mb-4">
                            ✅ Hai già votato per {contestState.category === 'DESSERT' ? 'questo dessert:' : 'questi partecipanti:'}
                        </p>
                        <ul className="text-gray-700 font-medium mb-6">
                            {userVotes.map((v) => (
                                <li key={v.candidate}>
                                    {v.candidate} — <span className="text-gray-500">{v.points} pt</span>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : contestState.category === 'DESSERT' ? (
                    <>
                        <p className="text-gray-600 mb-4">Scegli il tuo preferito:</p>
                        <div className="flex flex-col gap-3 mb-6">
                            {dessertOptions.map((opt) => (
                                <button
                                    key={opt}
                                    onClick={() => setSelectedDessert(opt)}
                                    className={`px-4 py-2 rounded-md border ${
                                        selectedDessert === opt
                                            ? 'bg-green-500 text-white border-green-600'
                                            : 'bg-gray-100 hover:bg-gray-200 border-gray-300'
                                    }`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={handleSubmitVote}
                            disabled={!selectedDessert}
                            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-6 py-2 rounded-md font-medium disabled:opacity-50"
                        >
                            Invia voto
                        </button>
                    </>
                ) : (
                    <>
                        <p className="text-gray-600 mb-4">Seleziona i tuoi 3 preferiti (ordine: 1° → 3°):</p>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {cosplayOptions.map((opt) => {
                                const idx = selectedCosplay.indexOf(opt);
                                return (
                                    <button
                                        key={opt}
                                        onClick={() => {
                                            if (idx >= 0) {
                                                setSelectedCosplay(selectedCosplay.filter((x) => x !== opt));
                                            } else if (selectedCosplay.length < 3) {
                                                setSelectedCosplay([...selectedCosplay, opt]);
                                            }
                                        }}
                                        className={`px-3 py-2 rounded-md border transition ${
                                            idx >= 0
                                                ? 'bg-blue-500 text-white border-blue-600'
                                                : 'bg-gray-100 hover:bg-gray-200 border-gray-300'
                                        }`}
                                    >
                                        {idx >= 0 ? `${idx + 1}° - ${opt}` : opt}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={handleSubmitVote}
                            disabled={selectedCosplay.length !== 3}
                            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-6 py-2 rounded-md font-medium disabled:opacity-50"
                        >
                            Invia voti
                        </button>
                    </>
                )}
            </main>
        );
    }

    // --- Caso 2: quiz attivo ---
    if (quizState?.is_active && currentQuestion) {
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
                {submitted && <p className="text-center text-green-600 mt-4 font-medium">✅ Risposta registrata</p>}
            </main>
        );
    }

    // --- Caso 3: nessun quiz o contest attivo ---
    return (
        <main className="flex flex-col items-center justify-center h-screen text-center">
            {finalScore != null ? (
                <>
                    <h1 className="text-2xl font-semibold text-gray-800 mb-3">🎉 Quiz completato!</h1>
                    <p className="text-xl font-bold text-green-600 mb-2">Hai totalizzato {finalScore} punti</p>
                    <p className="text-gray-500">Attendi che l’amministratore avvii un nuovo quiz o contest.</p>
                </>
            ) : (
                <>
                    <h1 className="text-2xl font-semibold text-gray-800 mb-3">Nessun quiz o contest attivo</h1>
                    <p className="text-gray-500">Attendi che l’amministratore apra una sessione.</p>
                </>
            )}
        </main>
    );
}