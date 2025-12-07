'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Question } from '@/types/QuestionProps';
import { renderQuestion } from '@/utils/renderQuestion';
import { useAuth } from '@/store/useUserStore';

interface ContestState {
    id: string;
    category: string;
    is_active: boolean;
    started_at?: string;
    ended_at?: string;
}

export default function QuizPageContent() {
    const { user } = useAuth();

    const [quizState, setQuizState] = useState<any | null>(null);
    const [contestState, setContestState] = useState<ContestState | null>(null);

    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);

    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);

    // Punteggio finale + info ultimo quiz
    const [finalPoints, setFinalPoints] = useState<number | null>(null);
    const [lastQuizName, setLastQuizName] = useState<string | null>(null);
    const [finalLoading, setFinalLoading] = useState(false);

    // Per votazioni contest
    const [contestCandidates, setContestCandidates] = useState<string[]>([]);
    const [selectedVotes, setSelectedVotes] = useState<string[]>([]);
    const [submitted, setSubmitted] = useState<boolean>(false);

    // ==============================================================
    // 🔹 Carica stato iniziale (quiz + contest)
    // ==============================================================
    useEffect(() => {
        const fetchStates = async () => {
            const [{ data: quiz }, { data: contest }] = await Promise.all([
                supabase.from('quiz_state').select('*').eq('is_active', true).maybeSingle(),
                supabase.from('contest_state').select('*').eq('is_active', true).maybeSingle(),
            ]);

            setQuizState(quiz ?? null);
            setContestState(contest ?? null);
            setLoading(false);
        };
        fetchStates();

        // listener realtime quiz_state
        const quizChannel = supabase
            .channel('quiz_state_realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'quiz_state' },
                (payload) => {
                    const newQuiz = payload.new as any;
                    if (newQuiz?.is_active) {
                        setQuizState(newQuiz);
                        setContestState(null);
                    }
                },
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'quiz_state' },
                (payload) => {
                    const newQuiz = payload.new as any;
                    if (newQuiz?.is_active) setQuizState(newQuiz);
                    else setQuizState(null);
                },
            )
            .subscribe();

        // listener realtime contest_state
        const contestChannel = supabase
            .channel('contest_state_realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'contest_state' },
                (payload) => {
                    const newContest = payload.new as ContestState;
                    if (newContest?.is_active) {
                        setContestState(newContest);
                        setQuizState(null);
                    }
                },
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'contest_state' },
                (payload) => {
                    const newContest = payload.new as ContestState;
                    if (newContest?.is_active) setContestState(newContest);
                    else setContestState(null);
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(quizChannel);
            supabase.removeChannel(contestChannel);
        };
    }, []);

    // 🔹 Quando parte un nuovo quiz, azzera eventuali punti finali vecchi
    useEffect(() => {
        if (quizState?.quiz_name) {
            setFinalPoints(null);
            setFinalLoading(false);
            setLastQuizName(quizState.quiz_name);
        }
    }, [quizState?.quiz_name]);

    // 🔹 Reset stati contest quando parte/finisce una votazione
    useEffect(() => {
        setSelectedVotes([]);
        setSubmitted(false);
        setContestCandidates([]);
    }, [contestState?.id, contestState?.category, contestState?.is_active]);

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
                setQuestions([]);
            }
        };
        loadQuiz();
    }, [quizState?.quiz_name]);

    // ==============================================================
    // 🔹 Imposta domanda corrente e timer sincronizzato
    // ==============================================================
    useEffect(() => {
        if (!quizState || !questions.length) return;

        const q = questions[quizState.current_question];
        setCurrentQuestion(q);

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
    // 🔹 Quando il quiz è finito → recupera i punti dell’utente
    // ==============================================================
    useEffect(() => {
        const fetchFinalPoints = async () => {
            if (quizState || contestState) return;
            if (!user) return;
            if (finalPoints !== null) return;

            setFinalLoading(true);

            let quizId = lastQuizName;

            if (!quizId) {
                const { data: lastSession, error: lastErr } = await supabase
                    .from('quiz_state')
                    .select('quiz_name, ended_at')
                    .not('ended_at', 'is', null)
                    .order('ended_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (lastErr) {
                    console.error('Errore fetch last quiz_state:', lastErr);
                    setFinalLoading(false);
                    return;
                }

                if (!lastSession?.quiz_name) {
                    console.warn('Nessun quiz concluso trovato per calcolare i punti utente.');
                    setFinalLoading(false);
                    return;
                }

                quizId = lastSession.quiz_name;
                setLastQuizName(quizId);
            }

            const { data, error } = await supabase.rpc('get_user_total_points', {
                p_user_id: user.id,
                p_quiz_id: quizId,
            });

            console.log('get_user_total_points result', { data, error });

            if (error) {
                console.error('Errore get_user_total_points:', error);
                setFinalLoading(false);
                return;
            }

            let points: number | null = null;

            if (typeof data === 'number') {
                points = data;
            } else if (Array.isArray(data) && data.length > 0) {
                const first = data[0] as any;
                const val = Object.values(first)[0];
                points = typeof val === 'number' ? val : 0;
            } else if (data && typeof data === 'object') {
                const val = Object.values(data as any)[0];
                points = typeof val === 'number' ? val : 0;
            } else {
                points = 0;
            }

            setFinalPoints(points);
            setFinalLoading(false);
        };

        fetchFinalPoints();
    }, [quizState, contestState, user, lastQuizName, finalPoints]);

    // ==============================================================
    // 🔹 Gestione risposta utente per quiz
    // ==============================================================
    const handleAnswer = async (answer: any) => {
        if (!quizState || !currentQuestion || !user) return;

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
    // 🔹 Gestione votazioni contest
    // ==============================================================
    useEffect(() => {
        const loadContestOptions = async () => {
            if (!contestState?.category) return;

            try {
                const res = await fetch(`/data/contest_options.json`);
                const json = await res.json();

                let options: string[] = [];

                const raw = json[contestState.category];

                if (Array.isArray(raw)) {
                    // formato attuale: "COSPLAY": ["Pepa", "Ignazio", ...]
                    options = raw;
                } else if (raw && Array.isArray(raw.options)) {
                    // compatibilità se in futuro torni al formato a oggetto:
                    // "COSPLAY": { ..., "options": ["Pepa", ...] }
                    options = raw.options;
                }

                setContestCandidates(options);
            } catch (err) {
                console.error('Errore caricamento opzioni contest:', err);
            }
        };
        loadContestOptions();
    }, [contestState?.category]);

    const handleContestVote = async () => {
        if (!contestState || !user || submitted || selectedVotes.length === 0) return;
        const isCosplay = contestState.category === 'COSPLAY';
        const maxVotes = isCosplay ? 3 : 1;
        if (selectedVotes.length < maxVotes) return;

        setSubmitted(true);

        const category = contestState.category;
        const insertRows =
            category === 'COSPLAY'
                ? [
                    { user_id: user.id, category, candidate: selectedVotes[0], points: 12 },
                    { user_id: user.id, category, candidate: selectedVotes[1], points: 10 },
                    { user_id: user.id, category, candidate: selectedVotes[2], points: 8 },
                ]
                : [{ user_id: user.id, category, candidate: selectedVotes[0], points: 12 }];

        const { error } = await supabase.from('contest_votes').insert(insertRows);
        if (error) console.error('Errore invio voto:', error);
    };

    // helper: etichetta posizione per candidato COSPLAY
    const getCosplayPositionLabel = (candidate: string) => {
        const idx = selectedVotes.indexOf(candidate);
        if (idx === -1) return null;
        const pos = idx + 1;
        const points = idx === 0 ? 12 : idx === 1 ? 10 : 8;
        return `${pos}º (${points} pt)`;
    };

    // ==============================================================
    // 🔹 UI states
    // ==============================================================
    if (loading) {
        return (
            <main className="flex items-center justify-center h-screen text-gray-500">
                Caricamento...
            </main>
        );
    }

    // =======================
    // Contest attivo
    // =======================
    if (contestState) {
        const isCosplay = contestState.category === 'COSPLAY';
        const maxVotes = isCosplay ? 3 : 1;

        const toggleSelect = (candidate: string) => {
            if (submitted) return;
            setSelectedVotes((prev) => {
                if (prev.includes(candidate)) return prev.filter((c) => c !== candidate);
                if (prev.length < maxVotes) return [...prev, candidate];
                return prev;
            });
        };

        return (
            <main className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-md rounded-lg">
                <h1 className="text-2xl font-bold text-center mb-4">
                    {isCosplay ? '🎭 COSPLAY CONTEST' : '🍰 DESSERT CONTEST'}
                </h1>
                <p className="text-center text-gray-600 mb-2">
                    {isCosplay
                        ? 'Scegli i tuoi 3 preferiti: il primo selezionato sarà 1º (12 pt), il secondo 2º (10 pt), il terzo 3º (8 pt).'
                        : 'Scegli il tuo dessert preferito (12 pt).'}
                </p>
                {isCosplay && (
                    <p className="text-center text-gray-500 mb-4 text-sm">
                        Puoi cambiare idea deselezionando e riselezionando i candidati.
                    </p>
                )}

                <ul className="space-y-3">
                    {contestCandidates.map((candidate) => {
                        const isSelected = selectedVotes.includes(candidate);
                        const posLabel = isCosplay ? getCosplayPositionLabel(candidate) : null;

                        return (
                            <li key={candidate}>
                                <button
                                    onClick={() => toggleSelect(candidate)}
                                    disabled={submitted}
                                    className={`w-full px-4 py-3 rounded-lg border text-left transition-all flex items-center justify-between ${
                                        isSelected
                                            ? 'bg-green-500 text-white border-green-500'
                                            : 'bg-gray-50 hover:bg-gray-100 border-gray-300'
                                    }`}
                                >
                                    <span>{candidate}</span>
                                    {posLabel && (
                                        <span className="text-xs font-semibold bg-white/20 px-2 py-1 rounded-md">
                      {posLabel}
                    </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>

                <div className="text-center mt-6">
                    <button
                        onClick={handleContestVote}
                        disabled={submitted || selectedVotes.length < maxVotes}
                        className="bg-[var(--color-primary)] text-white px-6 py-3 rounded-md font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed transition-all"
                    >
                        {submitted ? '✅ Voto registrato' : 'Invia voto'}
                    </button>
                </div>
            </main>
        );
    }

    // =======================
    // Nessun quiz attivo → mostra risultato se disponibile
    // =======================
    if (!quizState) {
        if (finalLoading && user) {
            return (
                <main className="flex flex-col items-center justify-center h-screen text-center">
                    <h1 className="text-2xl font-semibold text-gray-800 mb-3">Quiz concluso 🎉</h1>
                    <p className="text-gray-500">Calcolo del tuo punteggio in corso...</p>
                </main>
            );
        }

        if (finalPoints !== null && lastQuizName) {
            return (
                <main className="flex flex-col items-center justify-center h-screen text-center">
                    <h1 className="text-2xl font-semibold text-gray-800 mb-3">Quiz concluso 🎉</h1>
                    <p className="text-lg text-gray-700 mb-2">
                        Hai totalizzato{' '}
                        <span className="font-bold text-[var(--color-primary)]">{finalPoints}</span> punti
                    </p>
                    <p className="text-gray-500">
                        Quiz: <span className="font-medium">{lastQuizName}</span>
                    </p>
                    <p className="text-gray-500 mt-4">
                        Attendi che l’amministratore avvii una nuova sessione.
                    </p>
                </main>
            );
        }

        return (
            <main className="flex flex-col items-center justify-center h-screen text-center">
                <h1 className="text-2xl font-semibold text-gray-800 mb-3">Nessun quiz attivo</h1>
                <p className="text-gray-500">
                    Attendi che l’amministratore avvii una sessione o una votazione.
                </p>
            </main>
        );
    }

    // =======================
    // Quiz attivo → mostra domanda
    // =======================
    if (!currentQuestion) {
        return (
            <main className="flex items-center justify-center h-screen">
                <p className="text-gray-500">Caricamento domanda...</p>
            </main>
        );
    }

    const totalQuestions = questions.length;
    const currentIndex =
        quizState.current_question != null && totalQuestions
            ? quizState.current_question + 1
            : null;

    return (
        <main className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-md rounded-lg">
            <div className="flex justify-between items-center mb-4">
                <div className="text-gray-600 font-medium">
                    {currentIndex !== null && totalQuestions > 0
                        ? `Domanda ${currentIndex} di ${totalQuestions}`
                        : ''}
                </div>
                <div className={`font-medium ${timeLeft <= 5 ? 'text-red-600' : 'text-gray-600'}`}>
                    ⏱️ {timeLeft}s
                </div>
            </div>

            {renderQuestion(currentQuestion, {
                onAnswer: handleAnswer,
                disabled: timeLeft <= 0,
            })}
        </main>
    );
}
