'use client';

import React, { useEffect, useState } from 'react';
import {
    DndContext,
    closestCenter,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    PointerSensor,
    DragOverlay,
    DragStartEvent,
    DragEndEvent,
    DragCancelEvent,
} from '@dnd-kit/core';
import Xarrow, { Xwrapper } from 'react-xarrows';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { QuestionProps } from '@/types/QuestionProps';

interface Match {
    left: string;
    right: string | null;
}

/**
 * ✅ Estende QuestionProps mantenendo i campi originali (id, type, timeLimit, ecc.)
 * ma aggiunge la struttura specifica per MatchingQuestion
 */
interface MatchingQuestionProps extends Omit<QuestionProps, 'question'> {
    question: QuestionProps['question'] & {
        options: {
            left: string;
            rightOptions: string[];
        }[];
    };
}

interface DroppableBoxProps {
    id: string;
    droppableId: string;
    label: string;
    assigned?: string | null;
    disabled?: boolean;
    allRightOptions?: string[];
    onManualSelect?: (left: string, right: string | null) => void;
}

interface DraggableBoxProps {
    id: string;
    draggableId: string;
    label: string;
    disabled?: boolean;
    isOverlay?: boolean;
    snapBack?: boolean;
}

export default function MatchingQuestion({
                                             question,
                                             onAnswer,
                                             disabled,
                                         }: MatchingQuestionProps) {
    const [pairs, setPairs] = useState<Match[]>(
        question.options.map(opt => ({ left: opt.left, right: null }))
    );

    const allRightOptions: string[] = question.options[0]?.rightOptions ?? [];
    const [submitted, setSubmitted] = useState<boolean>(false);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 },
        })
    );

    const [activeId, setActiveId] = useState<string | null>(null);
    const [snapBack, setSnapBack] = useState<boolean>(false);

    const handleDragStart = (event: DragStartEvent) => {
        if (disabled || submitted) return;
        setActiveId(String(event.active.id));
        setSnapBack(false);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        if (disabled || submitted) return;
        const { over, active } = event;

        if (!over) {
            setSnapBack(true);
            setTimeout(() => setActiveId(null), 200);
            return;
        }

        const leftValue = String(over.id);
        const rightValue = String(active.id);

        setPairs(prev => {
            const cleared = prev.map(p =>
                p.right === rightValue ? { ...p, right: null } : p
            );
            return cleared.map(p =>
                p.left === leftValue ? { ...p, right: rightValue } : p
            );
        });

        setActiveId(null);
    };

    const handleDragCancel = (_event: DragCancelEvent) => {
        setSnapBack(true);
        setTimeout(() => setActiveId(null), 200);
    };

    const handleSubmit = () => {
        if (disabled || submitted) return;
        setSubmitted(true);
        onAnswer(pairs);
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{question.question}</h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Trascina o seleziona manualmente per creare gli abbinamenti.
            </p>

            <Xwrapper>
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                    modifiers={[restrictToWindowEdges]}
                >
                    <div
                        style={{
                            position: 'relative',
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '3rem',
                            alignItems: 'stretch',
                            minHeight: '350px',
                            touchAction: 'none',
                        }}
                    >
                        {/* SINISTRA */}
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                gap: '1rem',
                            }}
                        >
                            <p
                                style={{
                                    fontWeight: 600,
                                    color: '#4b5563',
                                    marginBottom: '0.25rem',
                                }}
                            >
                                Da abbinare:
                            </p>

                            {pairs.map(({ left, right }) => (
                                <DroppableBox
                                    key={left}
                                    id={`left-${left}`}
                                    droppableId={left}
                                    label={left}
                                    assigned={right}
                                    disabled={disabled || submitted}
                                    allRightOptions={allRightOptions.filter(
                                        (opt: string) =>
                                            !pairs.some(p => p.right === opt) || opt === right
                                    )}
                                    onManualSelect={(selectedLeft, newRight) => {
                                        setPairs(prev => {
                                            const cleared = prev.map(p =>
                                                p.right === newRight
                                                    ? { ...p, right: null }
                                                    : p
                                            );
                                            return cleared.map(p =>
                                                p.left === selectedLeft
                                                    ? { ...p, right: newRight }
                                                    : p
                                            );
                                        });
                                    }}
                                />
                            ))}
                        </div>

                        {/* DESTRA */}
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                gap: '1.5rem',
                            }}
                        >
                            <p
                                style={{
                                    fontWeight: 600,
                                    color: '#4b5563',
                                    marginBottom: '0.25rem',
                                    textAlign: 'center',
                                }}
                            >
                                Risposte:
                            </p>
                            {allRightOptions.map((right: string) => {
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
                        {pairs
                            .filter(p => p.right)
                            .map(({ left, right }) =>
                                right ? (
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
                                ) : null
                            )}
                    </div>

                    {/* Overlay */}
                    <DragOverlay
                        dropAnimation={{
                            duration: 200,
                            easing: 'ease-out',
                        }}
                    >
                        {activeId ? (
                            <DraggableBox
                                id={`overlay-${activeId}`}
                                draggableId={activeId}
                                label={activeId}
                                disabled
                                isOverlay
                                snapBack={snapBack}
                            />
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </Xwrapper>

            <button
                onClick={handleSubmit}
                disabled={disabled || submitted || pairs.some(p => !p.right)}
                style={{
                    marginTop: '1rem',
                    backgroundColor: 'var(--color-secondary)',
                    color: 'white',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.375rem',
                    fontWeight: 500,
                    opacity: disabled || submitted || pairs.some(p => !p.right) ? 0.5 : 1,
                    cursor:
                        disabled || submitted || pairs.some(p => !p.right)
                            ? 'not-allowed'
                            : 'pointer',
                    border: 'none',
                    transition: 'background-color 0.2s ease',
                }}
            >
                Conferma abbinamenti
            </button>
        </div>
    );
}

/* ---------------------------- COMPONENTI UI ---------------------------- */

const DroppableBox = React.forwardRef<HTMLDivElement, DroppableBoxProps>(
    ({ id, droppableId, label, assigned, disabled, allRightOptions = [], onManualSelect }, ref) => {
        const { setNodeRef, isOver } = useDroppable({ id: droppableId });

        return (
            <div
                id={id}
                ref={node => {
                    setNodeRef(node);
                    if (ref) (ref as any)(node);
                }}
                style={{
                    position: 'relative',
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    border: `2px solid ${isOver ? '#3b82f6' : '#d1d5db'}`,
                    backgroundColor: isOver ? '#eff6ff' : '#ffffff',
                    minHeight: '90px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                    opacity: disabled ? 0.6 : 1,
                    touchAction: 'none',
                }}
            >
                <span style={{ fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>
                    {label}
                </span>

                {/* Select interattiva */}
                {disabled ? (
                    <span
                        style={{
                            fontSize: '0.875rem',
                            textAlign: 'center',
                            marginTop: '0.5rem',
                            fontWeight: 600,
                            color: assigned ? 'var(--color-primary)' : '#9ca3af',
                            fontStyle: assigned ? 'normal' : 'italic',
                        }}
                    >
                        {assigned || '–'}
                    </span>
                ) : (
                    <select
                        value={assigned ?? ''}
                        onChange={e => onManualSelect?.(droppableId, e.target.value || null)}
                        style={{
                            fontSize: '0.875rem',
                            textAlign: 'center',
                            marginTop: '0.5rem',
                            padding: '0.25rem',
                            fontWeight: 600,
                            color: assigned ? 'var(--color-primary)' : '#6b7280',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.375rem',
                            backgroundColor: '#fff',
                            textTransform: 'none',
                        }}
                    >
                        <option value="">— Seleziona —</option>
                        {allRightOptions.map(opt => (
                            <option key={opt} value={opt}>
                                {opt}
                            </option>
                        ))}
                    </select>
                )}
            </div>
        );
    }
);

const DraggableBox = React.forwardRef<HTMLDivElement, DraggableBoxProps>(
    ({ id, draggableId, label, disabled, isOverlay, snapBack }, ref) => {
        const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
            id: draggableId,
            disabled: !!disabled,
        });

        const style: React.CSSProperties = {
            transform: transform
                ? `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${isDragging ? 1.05 : 1})`
                : undefined,
            transition:
                isDragging || isOverlay
                    ? snapBack
                        ? 'transform 0.2s ease-out'
                        : 'none'
                    : 'transform 0.15s ease',
            padding: '1rem',
            borderRadius: '0.375rem',
            border: '2px solid #e5e7eb',
            backgroundColor: isDragging || isOverlay ? 'var(--color-primary)' : '#ffffff',
            color: isDragging || isOverlay ? 'white' : '#374151',
            fontWeight: 500,
            textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'grab',
            boxShadow: isDragging || isOverlay
                ? '0 4px 10px rgba(0, 0, 0, 0.15)'
                : '0 1px 2px rgba(0, 0, 0, 0.05)',
            opacity: disabled && !isOverlay ? 0.5 : 1,
            userSelect: 'none',
            touchAction: 'none',
        };

        return (
            <div
                id={id}
                ref={node => {
                    setNodeRef(node);
                    if (ref) (ref as any)(node);
                }}
                {...listeners}
                {...attributes}
                style={style}
            >
                {label}
            </div>
        );
    }
);