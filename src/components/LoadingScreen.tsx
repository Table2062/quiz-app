'use client';
import { motion } from 'framer-motion';

export default function LoadingScreen({ message = 'Caricamento in corso...' }: { message?: string }) {
    return (
        <motion.div
            className="flex flex-col items-center justify-center h-screen bg-gradient-to-b from-blue-50 to-blue-100"
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
                    className="h-20 w-20 border-t-4 border-b-4 border-blue-600 rounded-full mb-8"
                />

                <motion.h1
                    className="text-3xl font-bold text-blue-800 mb-2"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                >
                    Quiz App
                </motion.h1>

                <motion.p
                    className="text-gray-700 text-lg font-medium mt-2"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                >
                    {message}
                </motion.p>
            </motion.div>
        </motion.div>
    );
}