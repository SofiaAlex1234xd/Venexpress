'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usersService } from '@/services/users.service';
import Card from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';

export default function NewVendorPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        password: '',
        initialDebt: 0,
    });
    const [alertState, setAlertState] = useState<{ isOpen: boolean; message: string; variant?: 'error' | 'success' | 'warning' | 'info' }>({
        isOpen: false,
        message: '',
        variant: 'info'
    });

    useEffect(() => {
        if (authLoading) return;
        
        if (!user || (user.role !== 'admin_colombia' && user.role !== 'admin_venezuela')) {
            router.push('/dashboard');
        }
    }, [user, authLoading, router]);

    if (authLoading) {
        return null;
    }

    if (!user || (user.role !== 'admin_colombia' && user.role !== 'admin_venezuela')) {
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name || !formData.email || !formData.phone || !formData.password) {
            setAlertState({
                isOpen: true,
                message: 'Por favor completa todos los campos requeridos',
                variant: 'warning'
            });
            return;
        }

        try {
            setLoading(true);
            // Usar el método correcto según el rol del usuario
            if (user.role === 'admin_venezuela') {
                await usersService.createVendorVenezuela(formData);
            } else {
                await usersService.createVendor(formData);
            }
            setAlertState({
                isOpen: true,
                message: 'Vendedor creado exitosamente',
                variant: 'success'
            });
            setTimeout(() => {
                router.push('/dashboard/vendors');
            }, 1500);
        } catch (error: any) {
            setAlertState({
                isOpen: true,
                message: error.response?.data?.message || 'Error al crear vendedor',
                variant: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 sm:p-8 max-w-2xl mx-auto">
            <div className="mb-8">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Volver
                </button>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Crear Nuevo Vendedor</h1>
                <p className="text-gray-600">Completa la información para crear un nuevo vendedor</p>
            </div>

            <Card>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nombre Completo *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                            placeholder="Ej: Juan Pérez"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email *
                        </label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                            placeholder="vendedor@ejemplo.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Teléfono *
                        </label>
                        <input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                            placeholder="3001234567"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Contraseña *
                        </label>
                        <input
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                            placeholder="Mínimo 6 caracteres"
                            minLength={6}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Deuda Inicial (opcional)
                        </label>
                        <input
                            type="number"
                            value={formData.initialDebt}
                            onChange={(e) => setFormData({ ...formData, initialDebt: parseFloat(e.target.value) || 0 })}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                            placeholder="0"
                            min="0"
                            step="0.01"
                        />
                        <p className="text-xs text-gray-500 mt-1">Si el vendedor tiene una deuda inicial, ingrésala aquí</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                                    Creando...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Crear Vendedor
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </Card>

            <Alert
                isOpen={alertState.isOpen}
                message={alertState.message}
                variant={alertState.variant}
                onClose={() => setAlertState({ ...alertState, isOpen: false })}
            />
        </div>
    );
}
