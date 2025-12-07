import { useState } from 'react';
import { QuestionProps } from '@/types/QuestionProps';

export default function MultipleSelectQuestion({ question, onAnswer, disabled }: QuestionProps) {
    const [selected, setSelected] = useState<number[]>([]);
    const [submitted, setSubmitted] = useState<boolean>(false);

    const toggleOption = (index: number) => {
        if (disabled || submitted) return;
        setSelected((prev) =>
            prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
        );
    };

    const handleSubmit = () => {
        if (selected.length === 0 || disabled || submitted) return;

        const selectedValues = selected.map((i) => question.options[i]);
        onAnswer(selectedValues); // 🔹 inviamo come array di stringhe, es. ["Python", "Java"]
        setSubmitted(true);
    };

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold">{question.question}</h2>

            <div className="grid gap-3">
                {question.options.map((opt, idx) => (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => toggleOption(idx)}
                        disabled={disabled || submitted}
                        className={`px-4 py-2 rounded-md border text-left transition-all ${
                            selected.includes(idx)
                                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                                : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-800'
                        } ${disabled || submitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {opt}
                    </button>
                ))}
            </div>

            {!submitted && (
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={selected.length === 0 || disabled}
                    className={`w-full mt-4 py-2 rounded-md font-medium text-white transition-all ${
                        selected.length > 0 && !disabled
                            ? 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'
                            : 'bg-gray-300 cursor-not-allowed'
                    }`}
                >
                    Invia risposta
                </button>
            )}
        </div>
    );
}