'use client';

import React, { useEffect, useState } from 'react';
import { QuestionProps } from '@/types/QuestionProps';
import { DndContext, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core';
import Xarrow, { Xwrapper } from 'react-xarrows';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';

interface Match { left: string; right: string | null }

export default function MatchingQuestion({ question, onAnswer, disabled }: QuestionProps) {
    const [pairs, setPairs] = useState<Match[]>(
        question.options.map((opt: any) => ({ left: opt.left, right: null }))
    );
    const allRightOptions = question.options[0]?.rightOptions ?? [];
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = () => {
        if (disabled || submitted) return;
        setSubmitted(true);
        onAnswer(pairs);
    };

    // gestione drag/drop
    const handleDragEnd = (event: any) => {
        if (disabled || submitted) return;
        const { over, active } = event;
        if (!over) return;
        const leftValue = over.id as string;
        const rightValue = active.id as string;

        setPairs(prev => {
            const cleared = prev.map(p => (p.right === rightValue ? { ...p, right: null } : p));
            return cleared.map(p => (p.left === leftValue ? { ...p, right: rightValue } : p));
        });
    };

    // forza refresh linee su scroll/resize
    const [, setTick] = useState(0);
    useEffect(() => {
        const onChange = () => setTick(t => t + 1);
        window.addEventListener('resize', onChange);
        window.addEventListener('scroll', onChange, { passive: true });
        return () => {
            window.removeEventListener('resize', onChange);
            window.removeEventListener('scroll', onChange);
        };
    }, []);

    return (
        <div className="space-y-5">
            <h2 className="text-lg font-semibold">{question.question}</h2>
            <p className="text-sm text-gray-500">Trascina una risposta a destra su un elemento a sinistra per abbinarli.</p>

            <Xwrapper>
                <DndContext
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToWindowEdges]}
                >
                    <div className="relative grid grid-cols-2 gap-12 items-stretch min-h-[350px]">
                        {/* SINISTRA */}
                        <div className="flex flex-col justify-between space-y-4">
                            <p className="font-semibold text-gray-600 mb-1">Da abbinare:</p>
                            {pairs.map(({ left, right }) => (
                                <DroppableBox
                                    key={left}
                                    id={`left-${left}`}
                                    droppableId={left}
                                    label={left}
                                    assigned={right}
                                    disabled={disabled || submitted}
                                />
                            ))}
                        </div>

                        {/* DESTRA */}
                        <div className="flex flex-col justify-center space-y-6">
                            <p className="font-semibold text-gray-600 mb-1 text-center">Risposte:</p>
                            {allRightOptions.map((right) => {
                                const isUsed = pairs.some(p => p.right === right);
                                return (
                                    <DraggableBox
                                        key={right}
                                        id={`right-${right}`}
                                        draggableId={right}
                                        label={right}
                                        disabled={disabled || submitted || isUsed}
                                    />
                                );
                            })}
                        </div>

                        {/* LINEE */}
                        {pairs.filter(p => p.right).map(({ left, right }) => (
                            <Xarrow
                                key={`${left}-${right}`}
                                start={`left-${left}`}
                                end={`right-${right}`}
                                color="#2563eb"
                                showHead={false}
                                strokeWidth={3}
                                dashness={{ animation: 1 }}
                                curveness={0.3}
                            />
                        ))}
                    </div>
                </DndContext>
            </Xwrapper>

            <button
                onClick={handleSubmit}
                disabled={disabled || submitted || pairs.some(p => !p.right)}
                className="mt-4 bg-[var(--color-secondary)] hover:bg-[var(--color-secondary-hover)] text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
            >
                Conferma abbinamenti
            </button>
        </div>
    );
}

/* ---------------------------- COMPONENTI UI ---------------------------- */

const DroppableBox = React.forwardRef<HTMLDivElement, {
    id: string; droppableId: string; label: string; assigned?: string | null; disabled?: boolean;
}>(({ id, droppableId, label, assigned, disabled }, ref) => {
    const { setNodeRef, isOver } = useDroppable({ id: droppableId });
    return (
        <div
            id={id}
            ref={(node) => { setNodeRef(node); if (ref) (ref as any)(node); }}
            className={`relative p-3 border rounded-md min-h-[90px] flex flex-col justify-between transition-all duration-150 ${
                isOver ? 'bg-blue-50 border-blue-500 shadow-sm' : 'bg-white border-gray-300'
            } ${disabled ? 'opacity-60' : ''}`}
        >
            <span className="font-medium text-gray-700 mb-1">{label}</span>

            <span
                className={`text-sm text-center mt-2 font-semibold ${
                    assigned
                        ? 'text-[var(--color-primary)]'
                        : 'text-gray-400 italic'
                }`}
            >
        {assigned || '–'}
      </span>
        </div>
    );
});

const DraggableBox = React.forwardRef<HTMLDivElement, {
    id: string; draggableId: string; label: string; disabled?: boolean;
}>(({ id, draggableId, label, disabled }, ref) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: draggableId });
    const style = {
        transform: transform
            ? `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${isDragging ? 1.05 : 1})`
            : undefined,
        transition: isDragging ? 'none' : 'transform 0.15s ease',
    };
    return (
        <div
            id={id}
            ref={(node) => { setNodeRef(node); if (ref) (ref as any)(node); }}
            {...listeners}
            {...attributes}
            style={style}
            className={`p-4 border rounded-md bg-white text-gray-700 font-medium cursor-grab shadow-sm transition-all duration-150 text-center ${
                isDragging
                    ? 'bg-[var(--color-primary)] text-white shadow-lg border-[var(--color-primary-hover)] scale-105'
                    : 'hover:shadow-md hover:border-[var(--color-primary)]'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            {label}
        </div>
    );
});