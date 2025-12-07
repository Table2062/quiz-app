import { useState, useEffect } from 'react';
import { QuestionProps } from '@/types/QuestionProps';
import { Reorder } from 'framer-motion';

export default function OrderingQuestion({ question, onAnswer, disabled }: QuestionProps) {
    const [order, setOrder] = useState<string[]>(question.options);
    const [submitted, setSubmitted] = useState(false);
    const [latestOrder, setLatestOrder] = useState<string[]>(question.options);

    // 🔹 Mantieni sempre sincronizzato lo stato locale con l’ordine più recente
    useEffect(() => {
        setLatestOrder(order);
    }, [order]);

    const moveOption = (index: number, direction: 'up' | 'down') => {
        if (disabled || submitted) return;
        const newOrder = [...order];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newOrder.length) return;
        [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
        setOrder(newOrder);
    };

    const handleSubmit = () => {
        if (disabled || submitted) return;
        setSubmitted(true);
        // Usa sempre l’ultimo ordine aggiornato (sincronizzato da useEffect)
        onAnswer(latestOrder);
    };

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold">{question.question}</h2>
            <p className="text-sm text-gray-500 mb-2">Trascina o usa le frecce per riordinare.</p>

            <Reorder.Group
                axis="y"
                values={order}
                onReorder={setOrder}
                className={`space-y-2 ${disabled || submitted ? 'opacity-60 pointer-events-none' : ''}`}
            >
                {order.map((opt, idx) => (
                    <Reorder.Item
                        key={opt}
                        value={opt}
                        className="flex items-center justify-between bg-white border border-gray-300 rounded-md px-4 py-2 cursor-grab"
                    >
                        <span>{opt}</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => moveOption(idx, 'up')}
                                disabled={idx === 0 || disabled || submitted}
                                className="text-gray-500 hover:text-[var(--color-primary)] disabled:opacity-40"
                            >
                                ↑
                            </button>
                            <button
                                onClick={() => moveOption(idx, 'down')}
                                disabled={idx === order.length - 1 || disabled || submitted}
                                className="text-gray-500 hover:text-[var(--color-primary)] disabled:opacity-40"
                            >
                                ↓
                            </button>
                        </div>
                    </Reorder.Item>
                ))}
            </Reorder.Group>

            <button
                onClick={handleSubmit}
                disabled={disabled || submitted}
                className="mt-3 bg-[var(--color-secondary)] hover:bg-[var(--color-secondary-hover)] text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
            >
                Invia risposta
            </button>
        </div>
    );
}