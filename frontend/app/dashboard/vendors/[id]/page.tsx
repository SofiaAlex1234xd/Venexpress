'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usersService, Vendor } from '@/services/users.service';
import { transactionsService } from '@/services/transactions.service';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import TransactionList from '@/components/TransactionList';
import { Transaction } from '@/types/transaction';
import Alert from '@/components/ui/Alert';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function VendorDetailsPage() {
    const { id } = useParams();
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [loading, setLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [activeTab, setActiveTab] = useState<'unpaid' | 'paid'>('unpaid');
    const [page, setPage] = useState(1);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [pagination, setPagination] = useState({ page: 1, lastPage: 1, total: 0 });
    const [alertState, setAlertState] = useState<{ isOpen: boolean; message: string; variant?: 'error' | 'success' | 'warning' | 'info' }>({
        isOpen: false,
        message: '',
        variant: 'info'
    });
    const [confirmState, setConfirmState] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        onCancel: () => { }
    });

    useEffect(() => {
        if (authLoading) return;
        if (!user || (user.role !== 'admin_colombia' && user.role !== 'admin_venezuela')) {
            router.push('/dashboard');
            return;
        }
        if (id && selectedPeriod !== 'custom') {
            loadVendorDetails();
        }
    }, [id, user, authLoading, selectedPeriod]);

    useEffect(() => {
        if (id && (selectedPeriod !== 'custom' || (startDate && endDate))) {
            loadTransactions();
        }
    }, [id, selectedPeriod, startDate, endDate, activeTab, page]);

    const handleCustomDateSearch = () => {
        if (startDate && endDate) {
            loadVendorDetails();
            loadTransactions();
        }
    };

    const loadVendorDetails = async () => {
        try {
            setStatsLoading(true);
            const query: any = {};
            if (selectedPeriod !== 'all') query.period = selectedPeriod;
            if (selectedPeriod === 'custom') {
                query.startDate = startDate;
                query.endDate = endDate;
            }
            const data = await usersService.getVendorDebtDetails(Number(id), query);
            setVendor(data.vendor);
        } catch (error) {
            console.error('Error loading vendor details:', error);
        } finally {
            setStatsLoading(false);
        }
    };

    const loadTransactions = async () => {
        try {
            setLoading(true);
            const query: any = {
                page,
                limit: 10,
                isPaid: activeTab === 'paid',
            };
            if (selectedPeriod !== 'all') query.period = selectedPeriod;
            if (selectedPeriod === 'custom') {
                query.startDate = startDate;
                query.endDate = endDate;
            }
            const data = await usersService.getVendorTransactions(Number(id), query);
            setTransactions(data.data);
            setPagination(data.meta);
        } catch (error) {
            console.error('Error loading transactions:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const handleUnmarkPaid = (transactionId: number) => {
        setConfirmState({
            isOpen: true,
            title: 'Revertir pago',
            message: '¿Estás seguro de que deseas revertir este pago? La transacción volverá a estar en pendiente de pago.',
            onConfirm: async () => {
                try {
                    await transactionsService.unmarkAsPaid(transactionId);
                    setAlertState({
                        isOpen: true,
                        message: 'Pago revertido exitosamente. La transacción volvió a estar en pendiente de pago.',
                        variant: 'success'
                    });
                    setConfirmState({ isOpen: false, title: '', message: '', onConfirm: () => { }, onCancel: () => { } });
                    loadTransactions();
                    loadVendorDetails();
                } catch (error: any) {
                    setAlertState({
                        isOpen: true,
                        message: error.response?.data?.message || 'Error al revertir el pago',
                        variant: 'error'
                    });
                    setConfirmState({ isOpen: false, title: '', message: '', onConfirm: () => { }, onCancel: () => { } });
                }
            },
            onCancel: () => {
                setConfirmState({ isOpen: false, title: '', message: '', onConfirm: () => { }, onCancel: () => { } });
            }
        });
    };

    const handleVerifyPayment = async (transactionId: number) => {
        try {
            await transactionsService.verifyVendorPayment(transactionId);
            setAlertState({
                isOpen: true,
                message: 'Pago verificado correctamente',
                variant: 'success'
            });
            loadTransactions();
        } catch (error: any) {
            setAlertState({
                isOpen: true,
                message: error.response?.data?.message || 'Error al verificar el pago',
                variant: 'error'
            });
        }
    };

    if (statsLoading && !vendor) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-600"></div>
            </div>
        );
    }

    if (!vendor) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold text-gray-700">Vendedor no encontrado</h2>
                <Button variant="outline" onClick={() => router.back()} className="mt-4">
                    Volver
                </Button>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{vendor.name}</h1>
                    <p className="text-gray-500">Detalles y estado de cuenta</p>
                </div>
                <Button variant="outline" onClick={() => router.back()}>
                    Volver
                </Button>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Filtrar por Período</h3>

                {/* Period Buttons */}
                <div className="flex flex-wrap gap-3 mb-4">
                    <button
                        onClick={() => setSelectedPeriod('all')}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${selectedPeriod === 'all'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        Todo
                    </button>
                    <button
                        onClick={() => setSelectedPeriod('today')}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${selectedPeriod === 'today'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        Hoy
                    </button>
                    <button
                        onClick={() => setSelectedPeriod('last15days')}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${selectedPeriod === 'last15days'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        Últimos 15 Días
                    </button>
                    <button
                        onClick={() => setSelectedPeriod('thisMonth')}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${selectedPeriod === 'thisMonth'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        Este Mes
                    </button>
                    <button
                        onClick={() => setSelectedPeriod('custom')}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${selectedPeriod === 'custom'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        Rango Personalizado
                    </button>
                </div>

                {/* Custom Date Range */}
                {selectedPeriod === 'custom' && (
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                        <div className="flex-1 min-w-0 sm:min-w-[180px]">
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                                Fecha Inicio
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            />
                        </div>
                        <div className="flex-1 min-w-0 sm:min-w-[180px]">
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                                Fecha Fin
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            />
                        </div>
                        <button
                            onClick={handleCustomDateSearch}
                            disabled={!startDate || !endDate}
                            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                            Buscar
                        </button>
                    </div>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-red-50 border-red-100">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-red-800 font-semibold">
                            {selectedPeriod === 'all' && 'Deuda Total'}
                            {selectedPeriod === 'today' && 'Deuda Hoy'}
                            {selectedPeriod === 'last15days' && 'Deuda Últimos 15 Días'}
                            {selectedPeriod === 'thisMonth' && 'Deuda Este Mes'}
                            {selectedPeriod === 'custom' && 'Deuda Rango Personalizado'}
                        </h3>
                        <svg className="w-8 h-8 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="text-3xl font-bold text-red-600">{formatCurrency(vendor.debt)}</p>
                    <p className="text-sm text-red-600 mt-1">Monto pendiente por pagar</p>
                </Card>
                <Card className="bg-green-50 border-green-100">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-green-800 font-semibold">
                            {selectedPeriod === 'all' && 'Total Pagado Histórico'}
                            {selectedPeriod === 'today' && 'Pagado Hoy'}
                            {selectedPeriod === 'last15days' && 'Pagado Últimos 15 Días'}
                            {selectedPeriod === 'thisMonth' && 'Pagado Este Mes'}
                            {selectedPeriod === 'custom' && 'Pagado Rango Personalizado'}
                        </h3>
                        <svg className="w-8 h-8 text-green-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="text-3xl font-bold text-green-600">{formatCurrency(vendor.paidAmount)}</p>
                    <p className="text-sm text-green-600 mt-1">Acumulado histórico</p>
                </Card>
            </div>

            {/* Info Card */}
            <Card>
                <h3 className="text-lg font-bold text-gray-900 mb-4">Información Personal</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Correo Electrónico</p>
                        <p className="font-medium text-gray-900">{vendor.email}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Teléfono</p>
                        <p className="font-medium text-gray-900">{vendor.phone}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Punto Físico</p>
                        <p className="font-medium text-gray-900">{vendor.point?.name || 'No asignado'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Estado</p>
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${vendor.isBanned ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                            }`}>
                            {vendor.isBanned ? 'Baneado' : 'Activo'}
                        </span>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Fecha de Registro</p>
                        <p className="font-medium text-gray-900">{new Date(vendor.createdAt).toLocaleDateString('es-CO')}</p>
                    </div>
                </div>
            </Card>

            {/* Transactions Section */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex" aria-label="Tabs">
                        <button
                            onClick={() => { setActiveTab('unpaid'); setPage(1); }}
                            className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${activeTab === 'unpaid'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            Pendientes de Pago
                        </button>
                        <button
                            onClick={() => { setActiveTab('paid'); setPage(1); }}
                            className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${activeTab === 'paid'
                                ? 'border-green-500 text-green-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            Historial de Pagos
                        </button>
                    </nav>
                </div>

                <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">
                        {activeTab === 'unpaid' ? 'Transacciones Pendientes' : 'Transacciones Pagadas'}
                    </h3>
                </div>

                <TransactionList
                    transactions={transactions}
                    loading={loading}
                    pagination={pagination}
                    onPageChange={setPage}
                    showSelection={false}
                    showVendorPaymentMethod={activeTab === 'paid'}
                    showUnmarkButton={activeTab === 'paid'}
                    onUnmarkPaid={handleUnmarkPaid}
                    showVerifyButton={activeTab === 'paid'}
                    onVerifyPayment={handleVerifyPayment}
                />
            </div>

            {/* Alerts */}
            <Alert
                isOpen={alertState.isOpen}
                message={alertState.message}
                variant={alertState.variant}
                onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
            />

            <ConfirmDialog
                isOpen={confirmState.isOpen}
                title={confirmState.title}
                message={confirmState.message}
                onConfirm={confirmState.onConfirm}
                onCancel={confirmState.onCancel}
            />
        </div>
    );
}
