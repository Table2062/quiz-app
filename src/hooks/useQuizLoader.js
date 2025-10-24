import { useState, useEffect } from 'react';

// Nota: non includere le risposte corrette nel JSON servito agli utenti.
// Le risposte corrette devono essere memorizzate solo su Supabase e accessibili
// tramite API dedicate riservate all'admin.

export function useQuizLoader(quizId) {
    const [quiz, setQuiz] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        fetch(`/quizzes/${quizId}.json`)
            .then(res => res.json())
            .then(data => setQuiz(data));
    }, [quizId]);

    const currentQuestion = quiz?.questions[currentIndex] || null;

    const nextQuestion = () => {
        if (quiz && currentIndex < quiz.questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    };

    return { quiz, currentQuestion, nextQuestion, currentIndex };
}