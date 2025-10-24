import ProtectedRoute from '@/components/auth/ProtectedRoute.tsx';
import QuizPageContent from '@/components/quiz/QuizPageContent';

export default function QuizPage() {
    return (
        <ProtectedRoute requiredRole="user">
            <QuizPageContent />
        </ProtectedRoute>
    );
}