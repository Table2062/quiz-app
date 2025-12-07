import { useState } from 'react';
import { QuestionProps } from '@/types/QuestionProps';

export default function AudioMultipleChoiceQuestion({ question, onAnswer, disabled }: QuestionProps) {
    const [selected, setSelected] = useState<number | null>(null);
    const [submitted, setSubmitted] = useState<boolean>(false);

    const handleSelect = (index: number) => {
        if (disabled || submitted) return;
        setSelected(index);
    };

    const handleSubmit = () => {
        if (selected === null || disabled || submitted) return;
        const selectedValue = question.options[selected];
        onAnswer([selectedValue]); // ✅ invia come array, coerente con le altre domande
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
                        onClick={() => handleSelect(idx)}
                        disabled={disabled || submitted}
                        className={`px-4 py-2 rounded-md border text-left transition-all ${
                            selected === idx
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
                    disabled={selected === null || disabled}
                    className={`w-full mt-4 py-2 rounded-md font-medium text-white transition-all ${
                        selected !== null && !disabled
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