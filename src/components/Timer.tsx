'use client';
import { useEffect, useState } from 'react';

interface TimerProps {
    time: number;               // es. tempo in secondi
    onTimeUp: () => void;       // callback quando finisce
}

export default function Timer({ time, onTimeUp }: TimerProps) {
    const [seconds, setSeconds] = useState(time);

    useEffect(() => {
        if (seconds <= 0) {
            onTimeUp && onTimeUp();
            return;
        }
        const interval = setInterval(() => setSeconds(prev => prev - 1), 1000);
        return () => clearInterval(interval);
    }, [seconds, onTimeUp]);

    return <div className="text-lg font-bold">{seconds}s</div>;
}