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

    // ==============================================================
    // 🔹 Recupera quiz_state attivo e sottoscrivi aggiornamenti realtime
    // ==============================================================
    useEffect(() => {
        const fetchQuizState = async () => {
            const { data, error } = await supabase
                .from('quiz_state')
                .select('*')
                .eq('is_active', true)
                .single();

            if (error && error.code !== 'PGRST116') console.error(error);
            setQuizState(data ?? null);
            setLoading(false);

            if (!data) {
                // Nessun quiz attivo → prova a recuperare punteggio ultima sessione
                fetchLastSessionScore();
            }
        };

        fetchQuizState();

        const channel = supabase
            .channel('quiz_state_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'quiz_state' },
                (payload) => {
                    console.log('[Realtime] Cambio quiz_state:', payload);

                    if (payload.eventType === 'UPDATE' && payload.new?.is_active === false) {
                        console.log('🔴 Quiz terminato');
                        const endedSessionId = payload.new.id; // <-- id della sessione chiusa
                        setQuizState(null);
                        setFinalScore(null);
                        fetchFinalScore(endedSessionId);
                        return;
                    }

                    if (payload.eventType === 'INSERT' && payload.new?.is_active) {
                        console.log('🟢 Nuovo quiz avviato');
                        setFinalScore(null);
                        setQuizState(payload.new);
                        return;
                    }

                    if (payload.eventType === 'UPDATE' && payload.new?.is_active) {
                        console.log('🔄 Quiz aggiornato (nuova domanda)');
                        setQuizState(payload.new);
                        return;
                    }

                    if (payload.eventType === 'DELETE') {
                        console.log('⚪ Quiz eliminato manualmente');
                        setQuizState(null);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // ==============================================================
    // 🔹 Carica il quiz JSON dal folder public/data/
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
        setSubmitted(false); // reset per nuova domanda

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
    }, [
        quizState?.current_question,
        quizState?.question_start,
        quizState?.question_duration,
        questions,
    ]);

    // ==============================================================
    // 🔹 Gestione risposta utente → salva su Supabase
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

            if (error) {
                console.error('Errore salvataggio risposta:', error);
            } else {
                console.log('✅ Risposta inviata con successo:', answer);
            }
        } catch (err) {
            console.error('Errore invio risposta:', err);
        }
    };

    // ==============================================================
    // 🔹 Recupera punteggio finale utente per sessione
    // ==============================================================
    const fetchFinalScore = async (sessionId: string) => {
        if (!user || !sessionId) return;

        try {
            const { data, error } = await supabase
                .from('answers')
                .select('points_awarded')
                .eq('user_id', user.id)
                .eq('session_id', sessionId);

            if (error) {
                console.error('Errore recupero punteggio:', error);
                return;
            }

            const total = (data ?? []).reduce((sum, r) => sum + (r.points_awarded ?? 0), 0);
            setFinalScore(total > 0 ? total : 0);
        } catch (err) {
            console.error('Errore calcolo punteggio finale:', err);
        }
    };

    // ==============================================================
    // 🔹 Recupera punteggio ultima sessione (fallback)
    // ==============================================================
    const fetchLastSessionScore = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('answers')
                .select('session_id')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1);

            if (!error && data && data[0]?.session_id) {
                fetchFinalScore(data[0].session_id);
            }
        } catch (err) {
            console.error('Errore recupero ultima sessione:', err);
        }
    };

    // ==============================================================
    // 🔹 Stati di caricamento / quiz terminato
    // ==============================================================
    if (loading) {
        return (
            <main className="flex items-center justify-center h-screen text-gray-500">
                Caricamento...
            </main>
        );
    }

    if (!quizState) {
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
                            Attendi che l’amministratore avvii un nuovo quiz per continuare.
                        </p>
                    </>
                ) : (
                    <>
                        <h1 className="text-2xl font-semibold text-gray-800 mb-3">
                            Nessun quiz attivo
                        </h1>
                        <p className="text-gray-500">
                            Attendi che l’amministratore avvii una sessione.
                        </p>
                    </>
                )}
            </main>
        );
    }

    // ==============================================================
    // 🔹 Render domanda corrente
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
                <h1 className="text-lg font-semibold text-gray-800">
                    Quiz: {quizState.quiz_name}
                </h1>
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