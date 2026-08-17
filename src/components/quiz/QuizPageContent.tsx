'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Question } from '@/types/QuestionProps';
import { renderQuestion } from '@/utils/renderQuestion';
import { useAuth } from '@/store/useUserStore';
import { getServerClockOffsetMs, nowSynced } from '@/utils/serverClock';

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
    const [clockOffsetMs, setClockOffsetMs] = useState<number>(0);

    useEffect(() => {
        getServerClockOffsetMs().then(setClockOffsetMs);
    }, []);

    // Punteggio finale quiz
    const [finalPoints, setFinalPoints] = useState<number | null>(null);
    const [lastQuizName, setLastQuizName] = useState<string | null>(null);
    const [finalLoading, setFinalLoading] = useState(false);

    // Contest
    const [userContestName, setUserContestName] = useState<string>('');
    const [contestCandidates, setContestCandidates] = useState<string[]>([]);
    const [selectedVotes, setSelectedVotes] = useState<string[]>([]);
    const [submitted, setSubmitted] = useState<boolean>(false);
    const [alreadyVoted, setAlreadyVoted] = useState<boolean>(false);

    useEffect(() => {
        const fetchName = async () => {
            if (user) {
                const { data } = await supabase
                    .from('users')
                    .select('name')
                    .eq('id', user.id)
                    .single();
                setUserContestName(data?.name ?? '');
            }
        };
        fetchName();
    }, [user]);

    // ==============================================================
    // 🔹 Load quiz + contest state (realtime + polling)
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

        const channel = supabase
            .channel('quiz_and_contest_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'quiz_state' },
                (payload) => {
                    const q = payload.new as any;
                    setQuizState(q?.is_active ? q : null);
                },
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'contest_state' },
                (payload) => {
                    const c = payload.new as ContestState;
                    setContestState(c?.is_active ? c : null);
                },
            )
            .subscribe();

        const interval = setInterval(fetchStates, 15000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, []);

    // ==============================================================
    // 🔹 Reset punti quando parte un nuovo quiz
    // ==============================================================
    useEffect(() => {
        if (quizState?.quiz_name) {
            setFinalPoints(null);
            setFinalLoading(false);
            setLastQuizName(quizState.quiz_name);
        }
    }, [quizState?.quiz_name]);

    // ==============================================================
    // 🔹 Reset contest SOLO quando cambia contest
    // ==============================================================
    useEffect(() => {
        setContestCandidates([]);
        setSelectedVotes([]);
        setSubmitted(false);
        setAlreadyVoted(false);
    }, [contestState?.id]);

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
    // 🔹 Imposta domanda corrente e timer
    // ==============================================================
    useEffect(() => {
        if (!quizState || !questions.length) return;

        const q = questions[quizState.current_question];
        setCurrentQuestion(q);

        const start = new Date(quizState.question_start).getTime();
        const duration = quizState.question_duration * 1000;

        const tick = () => {
            const now = nowSynced(clockOffsetMs);
            const diff = Math.max(0, Math.floor((start + duration - now) / 1000));
            setTimeLeft(diff);
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [
        quizState?.current_question,
        quizState?.question_start,
        quizState?.question_duration,
        questions,
        clockOffsetMs,
    ]);

    // ==============================================================
    // 🔹 Recupero punti finali quiz
    // ==============================================================
    useEffect(() => {
        const fetchFinalPoints = async () => {
            if (quizState || contestState || !user || finalPoints !== null) return;

            setFinalLoading(true);

            let quizId = lastQuizName;

            if (!quizId) {
                const { data: lastSession } = await supabase
                    .from('quiz_state')
                    .select('quiz_name, ended_at')
                    .not('ended_at', 'is', null)
                    .order('ended_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                quizId = lastSession?.quiz_name ?? null;
                setLastQuizName(quizId);
            }

            if (!quizId) {
                setFinalLoading(false);
                return;
            }

            const { data } = await supabase.rpc('get_user_total_points', {
                p_user_id: user.id,
                p_quiz_id: quizId,
            });

            const val =
                typeof data === 'number'
                    ? data
                    : Array.isArray(data)
                        ? Object.values(data[0] ?? {})[0]
                        : Object.values(data ?? {})[0];

            setFinalPoints(typeof val === 'number' ? val : 0);
            setFinalLoading(false);
        };

        fetchFinalPoints();
    }, [quizState, contestState, user, lastQuizName, finalPoints]);

    // ==============================================================
    // 🔹 Salva risposta quiz
    // ==============================================================
    const handleAnswer = async (answer: any) => {
        if (!quizState || !currentQuestion || !user) return;

        await supabase.from('answers').insert({
            user_id: user.id,
            quiz_id: quizState.quiz_name,
            question_id: currentQuestion.id,
            selected_options: answer,
            session_id: quizState.id,
        });
    };

    // ==============================================================
    // 🔹 Load contest options
    // ==============================================================
    useEffect(() => {
        const loadContestOptions = async () => {
            if (!contestState?.category) return;

            const res = await fetch('/data/contest_options.json');
            const json = await res.json();

            const raw = json[contestState.category];
            const options = Array.isArray(raw) ? raw : raw?.options ?? [];

            setContestCandidates(options);
        };

        loadContestOptions();
    }, [contestState?.category]);

    // ==============================================================
    // 🔹 Check: utente ha già votato (ORDINATO 🥇🥈🥉)
    // ==============================================================
    useEffect(() => {
        const checkIfAlreadyVoted = async () => {
            if (!contestState || !user) return;

            const { data } = await supabase
                .from('contest_votes')
                .select('candidate, points')
                .eq('user_id', user.id)
                .eq('category', contestState.category)
                .order('points', { ascending: false });

            if (data && data.length > 0) {
                setAlreadyVoted(true);
                setSubmitted(true);
                setSelectedVotes(data.map((v) => v.candidate));
            }
        };

        checkIfAlreadyVoted();
    }, [contestState?.category, user?.id]);

    // ==============================================================
    // 🔹 Submit voto contest
    // ==============================================================
    const handleContestVote = async () => {
        if (!contestState || !user || submitted || selectedVotes.length < 5) return;

        const rows = [
            { user_id: user.id, category: contestState.category, candidate: selectedVotes[0], points: 12 },
            { user_id: user.id, category: contestState.category, candidate: selectedVotes[1], points: 10 },
            { user_id: user.id, category: contestState.category, candidate: selectedVotes[2], points: 8 },
            { user_id: user.id, category: contestState.category, candidate: selectedVotes[3], points: 7 },
            { user_id: user.id, category: contestState.category, candidate: selectedVotes[4], points: 6 },
        ];

        const { error } = await supabase.from('contest_votes').insert(rows);
        if (!error) setSubmitted(true);
    };

    // ==============================================================
    // 🔹 Helpers UI
    // ==============================================================
    const getPositionLabel = (candidate: string) => {
        const idx = selectedVotes.indexOf(candidate);
        if (idx === -1) return null;

        const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : ''));
        const points = idx === 0 ? 12 : (idx === 1 ? 10 : (idx === 2 ? 8 : (idx === 3 ? 7 : 6)));

        return `${medal} ${idx + 1}º (${points} pt)`;
    };

    // ==============================================================
    // 🔹 UI STATES
    // ==============================================================
    if (loading) {
        return <main className="flex items-center justify-center h-screen text-white">Caricamento…</main>;
    }

    // =======================
    // Contest attivo
    // =======================
    if (contestState) {
        const toggleSelect = (candidate: string) => {
            if (submitted) return;
            setSelectedVotes((prev) =>
                prev.includes(candidate)
                    ? prev.filter((c) => c !== candidate)
                    : prev.length < 5
                        ? [...prev, candidate]
                        : prev,
            );
        };

        return (
            <main className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-md rounded-lg">
                <h1 className="text-2xl font-bold text-center mb-4">
                    🧞 {contestState.category} CONTEST
                </h1>

                {alreadyVoted && (
                    <div className="mb-4 p-3 rounded-md bg-green-100 text-green-800 text-center font-semibold">
                        ✅ Hai già votato
                    </div>
                )}

                <ul className="space-y-3">
                    {contestCandidates
                        .filter((candidate) => (candidate ?? '').toLowerCase() !== (userContestName ?? '').toLowerCase())
                        .map((candidate) => {
                            const isSelected = selectedVotes.includes(candidate);
                            const posLabel = getPositionLabel(candidate);

                            return (
                                <li key={candidate}>
                                    <button
                                        onClick={() => toggleSelect(candidate)}
                                        disabled={submitted}
                                        className={`w-full px-4 py-3 rounded-lg border flex justify-between items-center ${
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
                        disabled={submitted || selectedVotes.length < 5}
                        className="bg-[var(--color-primary)] text-white px-6 py-3 rounded-md font-semibold disabled:bg-gray-400"
                    >
                        {submitted ? 'Voto registrato' : 'Invia voto'}
                    </button>
                </div>
            </main>
        );
    }

    // =======================
    // Quiz attivo
    // =======================
    if (quizState && currentQuestion) {
        return (
            <main className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-md rounded-lg">
                <div className="flex justify-between mb-4">
                    <span>
                        Domanda {quizState.current_question + 1} / {questions.length}
                    </span>
                    <span className={timeLeft <= 5 ? 'text-red-600' : ''}>⏱️ {timeLeft}s</span>
                </div>

                {renderQuestion(currentQuestion, {
                    onAnswer: handleAnswer,
                    disabled: timeLeft <= 0,
                })}
            </main>
        );
    }

    // =======================
    // Benvenuto Le Mille e una Notte
    // =======================
    return (
        <main className="flex flex-col items-center justify-center min-h-screen text-center px-4 sm:px-6">
            <div className="max-w-md w-full">
                <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-white break-words">
                    🎉 Buon Compleanno Pepah! 🎉
                </h1>
                <p className="text-2xl sm:text-3xl font-semibold text-gray-100 mb-6">
                    ✨ Le Mille e una Notte ✨
                </p>
                <p className="text-xl sm:text-2xl font-semibold text-[var(--color-secondary)] mb-2">
                    🧞 Che la magia della notte abbia inizio! 🧞
                </p>
                <p className="text-base sm:text-lg text-gray-300">
                    Nessun quiz o contest attivo al momento.
                </p>
            </div>
        </main>
    );
}
