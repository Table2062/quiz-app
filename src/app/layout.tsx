import "./globals.css";
import type {Metadata} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import Navbar from '@/components/Navbar';
import PageTransition from '@/components/PageTransition';

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: 'Quiz App',
    description: 'Web app quiz interattiva con Supabase e Next.js',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="it">
            <body className="bg-gray-50">
                <Navbar />
                {children}
            </body>
        </html>
    );
}