import ProtectedRoute from '@/components/auth/ProtectedRoute.tsx';
import AdminDashboard from '@/components/admin/AdminDashboard';

export default function AdminPage() {
    return (
        <ProtectedRoute requiredRole="admin">
            <AdminDashboard />
        </ProtectedRoute>
    );
}