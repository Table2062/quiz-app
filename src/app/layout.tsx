import "./globals.css";
import type {Metadata} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import Navbar from '@/components/Navbar';

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: 'Le Mille e una Notte - Quiz Party',
    description: 'Web app quiz interattiva a tema "Le Mille e una Notte" con Supabase e Next.js',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="it">
            <body>
                <Navbar />
                {children}
            </body>
        </html>
    );
}