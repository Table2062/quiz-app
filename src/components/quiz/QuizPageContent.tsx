'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Question } from '@/types/QuestionProps';
import { renderQuestion } from '@/utils/renderQuestion';
import { useAuth } from '@/store/useUserStore';

interface ContestVote {
    candidate: string;
    points: number;
    position: number;
}

export default function QuizPageContent() {
    const { user } = useAuth();
    const [quizState, setQuizState] = useState<any>(null);
    const [contestState, setContestState] = useState<any>(null);

    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [submitted, setSubmitted] = useState<boolean>(false);
    const [finalScore, setFinalScore] = useState<number | null>(null);

    // Contest votes
    const [userVotes, setUserVotes] = useState<ContestVote[]>([]);
    const [candidates, setCandidates] = useState<string[]>([
        'Chiara',
        'Davide',
        'Peppe',
        'Ignazio',
        'Vale',
    ]);
    const [selectedContest, setSelectedContest] = useState<'DESSERT' | 'COSPLAY' | null>(null);

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
            setSelectedContest(contest?.category ?? null);
            setLoading(false);

            if (!quiz && !contest) {
                fetchLastSessionScore();
            }
        };

        fetchStates();

        // Realtime listeners
        const channel = supabase
            .channel('quiz_and_contest_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'quiz_state' },
                (payload) => {
                    const newState: any = payload.new || {};
                    setQuizState(newState.is_active ? newState : null);
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'contest_state' },
                (payload) => {
                    const newState: any = payload.new || {};
                    setContestState(newState.is_active ? newState : null);
                    setSelectedContest(newState.is_active ? newState.category : null);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
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
    // 🔹 Invio risposta quiz
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
            if (error) throw error;
        } catch (err) {
            console.error('Errore invio risposta:', err);
        }
    };

    // ==============================================================
    // 🔹 Recupera punteggio finale quiz
    // ==============================================================
    const fetchFinalScore = async (sessionId: string) => {
        if (!user || !sessionId) return;
        const { data, error } = await supabase
            .from('answers')
            .select('points_awarded')
            .eq('user_id', user.id)
            .eq('session_id', sessionId);

        if (!error && data) {
            const total = data.reduce((sum, r) => sum + (r.points_awarded ?? 0), 0);
            setFinalScore(total);
        }
    };

    const fetchLastSessionScore = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('answers')
            .select('session_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!error && data?.session_id) fetchFinalScore(data.session_id);
    };

    // ==============================================================
    // 🔹 Contest: Recupera voti utente
    // ==============================================================
    const fetchUserContestVote = async (category: 'DESSERT' | 'COSPLAY') => {
        if (!user) return;

        const { data, error } = await supabase.rpc('get_user_contest_vote', {
            p_user_id: user.id,
            p_category: category,
        });

        if (!error && data && data.length > 0 && data[0].votes) {
            setUserVotes(data[0].votes);
        } else {
            setUserVotes([]);
        }
    };

    // ==============================================================
    // 🔹 Contest: Invio voti
    // ==============================================================
    const submitContestVote = async (category: 'DESSERT' | 'COSPLAY') => {
        if (!user || userVotes.length === 0) return alert('Seleziona almeno un voto!');

        try {
            await supabase.from('contest_votes').delete().eq('user_id', user.id).eq('category', category);

            const rows = userVotes.map((v) => ({
                user_id: user.id,
                category,
                candidate: v.candidate,
                points: v.points,
                position: v.position,
            }));

            const { error } = await supabase.from('contest_votes').insert(rows);
            if (error) throw error;

            alert('✅ Voto registrato con successo!');
        } catch (err) {
            console.error('Errore invio voti:', err);
            alert('❌ Errore durante il salvataggio dei voti.');
        }
    };

    // ==============================================================
    // 🔹 Interfaccia contest (DESSERT / COSPLAY)
    // ==============================================================
    const handleVoteSelect = (candidate: string, position: number) => {
        let updated = [...userVotes];

        if (selectedContest === 'DESSERT') {
            updated = [{ candidate, points: 12, position: 1 }];
        } else if (selectedContest === 'COSPLAY') {
            updated = updated.filter((v) => v.position !== position);
            const pointsMap: Record<number, number> = { 1: 12, 2: 10, 3: 8 };
            updated.push({ candidate, position, points: pointsMap[position] });
        }

        setUserVotes(updated);
    };

    // ==============================================================
    // 🔹 Render – stati principali
    // ==============================================================
    if (loading)
        return <main className="flex items-center justify-center h-screen text-gray-500">Caricamento...</main>;

    // --- Se c'è un contest attivo ---
    if (contestState && selectedContest) {
        return (
            <main className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-md rounded-lg">
                <h1 className="text-2xl font-semibold text-gray-800 mb-4 text-center">
                    🏆 {selectedContest} CONTEST
                </h1>

                <p className="text-gray-600 mb-6 text-center">
                    {selectedContest === 'DESSERT'
                        ? 'Scegli il miglior dessert (12 punti).'
                        : 'Assegna 12, 10 e 8 punti ai tuoi 3 cosplay preferiti.'}
                </p>

                {selectedContest === 'COSPLAY' && (
                    <div className="flex flex-col gap-3 mb-6">
                        {[1, 2, 3].map((pos) => (
                            <div key={pos}>
                                <label className="block text-gray-700 mb-1">
                                    {pos}° posto ({pos === 1 ? '12pt' : pos === 2 ? '10pt' : '8pt'}):
                                </label>
                                <select
                                    value={userVotes.find((v) => v.position === pos)?.candidate ?? ''}
                                    onChange={(e) => handleVoteSelect(e.target.value, pos)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                                >
                                    <option value="">-- Seleziona --</option>
                                    {candidates.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                )}

                {selectedContest === 'DESSERT' && (
                    <div className="flex flex-col gap-3 mb-6">
                        <label className="block text-gray-700 mb-1">Miglior dessert (12pt):</label>
                        <select
                            value={userVotes[0]?.candidate ?? ''}
                            onChange={(e) => handleVoteSelect(e.target.value, 1)}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                            <option value="">-- Seleziona --</option>
                            {candidates.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <button
                    onClick={() => submitContestVote(selectedContest)}
                    className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white w-full py-3 rounded-md font-semibold transition-all"
                >
                    Invia voti
                </button>

                {userVotes.length > 0 && (
                    <div className="mt-6">
                        <h2 className="text-lg font-semibold text-gray-700 mb-2">I tuoi voti:</h2>
                        <ul className="list-disc list-inside text-gray-600">
                            {userVotes
                                .sort((a, b) => a.position - b.position)
                                .map((v, idx) => (
                                    <li key={idx}>
                                        {v.position}° - {v.candidate} ({v.points} punti)
                                    </li>
                                ))}
                        </ul>
                    </div>
                )}
            </main>
        );
    }

    // --- Se nessun quiz né contest attivo ---
    if (!quizState)
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
                        <h1 className="text-2xl font-semibold text-gray-800 mb-3">Nessun quiz attivo</h1>
                        <p className="text-gray-500">Attendi che l’amministratore avvii una sessione.</p>
                    </>
                )}
            </main>
        );

    // --- Quiz attivo ---
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