'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usersService, Vendor } from '@/services/users.service';
import Card from '@/components/ui/Card';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function VendorsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
    const [editForm, setEditForm] = useState({ email: '', password: '' });
    const [editLoading, setEditLoading] = useState(false);

    useEffect(() => {
        if (authLoading) return;

        if (!user || (user.role !== 'admin_colombia' && user.role !== 'admin_venezuela')) {
            router.push('/dashboard');
            return;
        }
        loadVendors();
    }, [user, authLoading]);

    const loadVendors = async () => {
        try {
            setLoading(true);
            // Call appropriate service method based on admin role
            const data = user?.role === 'admin_colombia'
                ? await usersService.getVendors()
                : await usersService.getVendorsVenezuela();
            setVendors(data || []);
        } catch (error) {
            console.error('Error loading vendors:', error);
            setVendors([]); // Mostrar lista vacía en caso de error
        } finally {
            setLoading(false);
        }
    };

    const filteredVendors = vendors.filter(vendor =>
        vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vendor.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vendor.phone.includes(searchTerm)
    );

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const handleEditVendor = (vendor: Vendor) => {
        setEditingVendor(vendor);
        setEditForm({ email: vendor.email, password: '' });
    };

    const handleCloseEdit = () => {
        setEditingVendor(null);
        setEditForm({ email: '', password: '' });
    };

    const handleSaveEdit = async () => {
        if (!editingVendor) return;
        
        if (!editForm.email.trim()) {
            alert('El correo electrónico es requerido');
            return;
        }

        try {
            setEditLoading(true);
            const updateData: any = { email: editForm.email };
            if (editForm.password.trim()) {
                updateData.password = editForm.password;
            }

            if (user?.role === 'admin_venezuela') {
                await usersService.updateVendorVenezuela(editingVendor.id, updateData);
            } else {
                await usersService.updateVendor(editingVendor.id, updateData);
            }

            await loadVendors();
            handleCloseEdit();
            alert('Vendedor actualizado exitosamente');
        } catch (error: any) {
            console.error('Error updating vendor:', error);
            alert(error.response?.data?.message || 'Error al actualizar el vendedor');
        } finally {
            setEditLoading(false);
        }
    };

    // Esperar a que termine la carga de autenticación
    if (authLoading) {
        return null;
    }

    // Verificar permisos
    if (!user || (user.role !== 'admin_colombia' && user.role !== 'admin_venezuela')) {
        return null;
    }

    return (
        <div className="p-4 sm:p-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Gestión de Vendedores</h1>
                    <p className="text-gray-600">Administra vendedores y monitorea su deuda</p>
                </div>
                <Link href="/dashboard/vendors/new">
                    <button className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-lg">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Crear Vendedor
                    </button>
                </Link>
            </div>

            {/* Search */}
            <Card className="mb-6">
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Buscar por nombre, email o teléfono..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                    />
                </div>
            </Card>

            {/* Vendors List */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-600 mx-auto"></div>
                    <p className="text-gray-500 mt-4">Cargando vendedores...</p>
                </div>
            ) : vendors.length === 0 ? (
                <Card>
                    <div className="text-center py-16">
                        <svg className="w-20 h-20 text-gray-300 mx-auto mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p className="text-gray-500 text-lg font-medium mb-2">No tienes vendedores</p>
                        <p className="text-gray-400 text-sm mb-6">Crea tu primer vendedor para comenzar</p>
                        <Link href="/dashboard/vendors/new">
                            <button className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Crear Primer Vendedor
                            </button>
                        </Link>
                    </div>
                </Card>
            ) : filteredVendors.length === 0 ? (
                <Card>
                    <div className="text-center py-12">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p className="text-gray-500 text-lg">No se encontraron vendedores con esos criterios</p>
                        <p className="text-gray-400 text-sm mt-2">Intenta con otro término de búsqueda</p>
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {filteredVendors.map((vendor) => (
                        <Card key={vendor.id} className="hover:shadow-xl transition-shadow">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center flex-shrink-0">
                                        <span className="text-white font-bold text-lg">
                                            {vendor.name.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">{vendor.name}</h3>
                                        <p className="text-sm text-gray-500">{vendor.email}</p>
                                        <p className="text-sm text-gray-500">{vendor.phone}</p>
                                    </div>
                                </div>
                                {vendor.isBanned && (
                                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                        Baneado
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="bg-red-50 rounded-lg p-3">
                                    <p className="text-xs text-red-600 font-medium mb-1">Deuda</p>
                                    <p className="text-lg font-bold text-red-700">
                                        {formatCurrency(vendor.debt)}
                                    </p>
                                </div>
                                <div className="bg-green-50 rounded-lg p-3">
                                    <p className="text-xs text-green-600 font-medium mb-1">Total Pagado</p>
                                    <p className="text-lg font-bold text-green-700">
                                        {formatCurrency(vendor.paidAmount)}
                                    </p>
                                </div>
                            </div>

                            {vendor.point && (
                                <div className="mb-4">
                                    <p className="text-xs text-gray-500 mb-1">Punto Físico</p>
                                    <p className="text-sm font-medium text-gray-700">{vendor.point.name}</p>
                                </div>
                            )}

                            <div className="flex gap-2">
                                {user?.role === 'admin_colombia' && (
                                    <Link href={`/dashboard/vendors/${vendor.id}`} className="flex-1">
                                        <button className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
                                            Ver Detalles
                                        </button>
                                    </Link>
                                )}
                                <button
                                    onClick={() => handleEditVendor(vendor)}
                                    className={`py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium ${user?.role === 'admin_colombia' ? 'flex-1' : 'w-full'}`}
                                >
                                    Editar
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Modal de Edición */}
            {editingVendor && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <Card className="w-full max-w-md mx-4">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-gray-900">Editar Vendedor</h2>
                            <button
                                onClick={handleCloseEdit}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nombre
                                </label>
                                <input
                                    type="text"
                                    value={editingVendor.name}
                                    disabled
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Correo Electrónico *
                                </label>
                                <input
                                    type="email"
                                    value={editForm.email}
                                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="correo@ejemplo.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nueva Contraseña (dejar vacío para no cambiar)
                                </label>
                                <input
                                    type="password"
                                    value={editForm.password}
                                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="Nueva contraseña"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={handleCloseEdit}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                    disabled={editLoading}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    disabled={editLoading}
                                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {editLoading ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
