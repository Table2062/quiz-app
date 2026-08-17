'use client';
import { motion } from 'framer-motion';

export default function LoadingScreen({ message = 'Caricamento in corso...' }: { message?: string }) {
    return (
        <motion.div
            className="flex flex-col items-center justify-center h-screen bg-gradient-to-b from-[#1e1541] via-[#14102b] to-[#2b1b4a]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
        >
            <motion.div
                className="flex flex-col items-center"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6 }}
            >
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                    className="h-20 w-20 border-t-4 border-b-4 border-[var(--color-secondary)] rounded-full mb-8"
                />

                <motion.h1
                    className="text-3xl font-bold text-[var(--color-secondary)] mb-2"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                >
                    🪔 Le Mille e una Notte
                </motion.h1>

                <motion.p
                    className="text-gray-200 text-lg font-medium mt-2"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                >
                    {message}
                </motion.p>
            </motion.div>
        </motion.div>
    );
}