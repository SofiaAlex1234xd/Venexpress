'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { transactionsService } from '@/services/transactions.service';
import { Transaction } from '@/types/transaction';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import TransactionList from '@/components/TransactionList';

type PeriodType = 'today' | 'last15days' | 'thisMonth' | 'custom' | 'all';

export default function DebtPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    // 1. TODOS LOS ESTADOS (useState)
    const [totalDebt, setTotalDebt] = useState<number>(0);
    const [paidAmount, setPaidAmount] = useState<number>(0);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedTransactions, setSelectedTransactions] = useState<number[]>([]);
    const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
    const [rangeStartDate, setRangeStartDate] = useState('');
    const [rangeEndDate, setRangeEndDate] = useState('');
    const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'consignacion_nequi' | 'consignacion_bancolombia' | ''>('');
    const [paymentProof, setPaymentProof] = useState<File | null>(null);
    const [paymentProofPreview, setPaymentProofPreview] = useState<string>('');
    const [pendingTransactionIds, setPendingTransactionIds] = useState<number[]>([]);
    const [isRangePayment, setIsRangePayment] = useState(false);
    const [activeTab, setActiveTab] = useState<'unpaid' | 'paid'>('unpaid');
    const [page, setPage] = useState(1);
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
    const [isEditPaymentModalOpen, setIsEditPaymentModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [editPaymentMethod, setEditPaymentMethod] = useState<'efectivo' | 'consignacion_nequi' | 'consignacion_bancolombia' | ''>('');
    const [editPaymentProof, setEditPaymentProof] = useState<File | null>(null);
    const [editPaymentProofPreview, setEditPaymentProofPreview] = useState<string>('');
    const [isUnmarking, setIsUnmarking] = useState(false);

    // 2. DEFINICIÓN DE FUNCIONES AUXILIARES (Deben estar antes de usarse en useEffect)
    const fetchStats = async () => {
        // Evitar fetch si no hay usuario
        if (!user) return;
        
        try {
            setStatsLoading(true);
            const periodParam = selectedPeriod === 'all' ? undefined : selectedPeriod;
            const customStart = selectedPeriod === 'custom' ? startDate : undefined;
            const customEnd = selectedPeriod === 'custom' ? endDate : undefined;

            const data = await transactionsService.getDebt(periodParam, customStart, customEnd);
            setTotalDebt(data.totalDebt);
            setPaidAmount(data.paidAmount);
        } catch (error) {
            console.error('Error fetching stats:', error);
        } finally {
            setStatsLoading(false);
        }
    };

    const fetchTransactions = async () => {
        // Evitar fetch si no hay usuario
        if (!user) return;

        try {
            setLoading(true);
            const query: { page: number; limit: number; isPaid: boolean; period?: string; startDate?: string; endDate?: string } = {
                page,
                limit: 10,
                isPaid: activeTab === 'paid',
            };

            if (selectedPeriod !== 'all') query.period = selectedPeriod;
            if (selectedPeriod === 'custom') {
                query.startDate = startDate;
                query.endDate = endDate;
            }

            const data = await transactionsService.getVendorHistory(query);
            setTransactions(data.data);
            setPagination(data.meta);
        } catch (error) {
            console.error('Error fetching transactions:', error);
        } finally {
            setLoading(false);
        }
    };

    // 3. TODOS LOS USEEFFECT (Deben estar antes de cualquier return)
    
    // Auth Guard
    useEffect(() => {
        // Esperar a que termine la carga antes de verificar autenticación
        if (authLoading) return;
        
        if (!user) {
            router.push('/login');
            return;
        }
        
        const isVendor = user.role === 'vendedor';
        const isAdminColombia = user.adminId === 1 || user.adminId === undefined || user.adminId === null;
        
        if (!isVendor || !isAdminColombia) {
            // Usar un timeout pequeño para evitar conflictos de estado
            const timer = setTimeout(() => {
                router.push('/dashboard');
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [user, authLoading, router]);

    // Fetch Stats Effect
    useEffect(() => {
        if (user && selectedPeriod !== 'custom') {
            fetchStats();
        }
    }, [selectedPeriod, startDate, endDate, user]); // Agregado user a dependencias

    // Fetch Transactions Effect
    useEffect(() => {
        if (user && (selectedPeriod !== 'custom' || (startDate && endDate))) {
            fetchTransactions();
        }
    }, [selectedPeriod, startDate, endDate, activeTab, page, user]); // Agregado user a dependencias

    // 4. HANDLERS Y LÓGICA DE EVENTOS
    const handleCustomDateSearch = () => {
        if (startDate && endDate) {
            fetchStats();
            fetchTransactions();
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-CO', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleEditPayment = (transaction: Transaction) => {
        setEditingTransaction(transaction);
        setEditPaymentMethod(transaction.vendorPaymentMethod as any || '');
        setEditPaymentProof(null);
        setEditPaymentProofPreview('');
        setIsEditPaymentModalOpen(true);
    };

    const handleEditPaymentProofChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setEditPaymentProof(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setEditPaymentProofPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleConfirmEditPayment = async () => {
        if (!editingTransaction) return;
        if (!editPaymentMethod && !editPaymentProof) {
            setAlertState({
                isOpen: true,
                message: 'Debes cambiar el método de pago o actualizar el comprobante',
                variant: 'warning'
            });
            return;
        }

        try {
            await transactionsService.updatePayment(editingTransaction.id, editPaymentMethod || undefined, editPaymentProof || undefined);
            setAlertState({
                isOpen: true,
                message: 'Pago actualizado exitosamente',
                variant: 'success'
            });
            setIsEditPaymentModalOpen(false);
            setEditingTransaction(null);
            setEditPaymentMethod('');
            setEditPaymentProof(null);
            setEditPaymentProofPreview('');
            fetchTransactions();
        } catch (error) {
            setAlertState({
                isOpen: true,
                message: 'Error actualizando el pago',
                variant: 'error'
            });
        }
    };

    const handleUnmarkPaid = (transactionId: number) => {
        setConfirmState({
            isOpen: true,
            title: 'Desmarcar como pagado',
            message: '¿Estás seguro de que deseas desmarcar esta transacción como pagada? Se perderá el registro del pago.',
            onConfirm: async () => {
                try {
                    setIsUnmarking(true);
                    await transactionsService.unmarkAsPaid(transactionId);
                    setAlertState({
                        isOpen: true,
                        message: 'Transacción desmarcada exitosamente',
                        variant: 'success'
                    });
                    setConfirmState({ isOpen: false, title: '', message: '', onConfirm: () => { }, onCancel: () => { } });
                    fetchTransactions();
                } catch (error) {
                    setAlertState({
                        isOpen: true,
                        message: 'Error desmarcando la transacción',
                        variant: 'error'
                    });
                    setConfirmState({ isOpen: false, title: '', message: '', onConfirm: () => { }, onCancel: () => { } });
                } finally {
                    setIsUnmarking(false);
                }
            }
        });
    };

    const handleSelectTransaction = (id: number) => {
        setSelectedTransactions(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selectedTransactions.length === transactions.length) {
            setSelectedTransactions([]);
        } else {
            setSelectedTransactions(transactions.map(t => t.id));
        }
    };

    const handleMarkSelectedAsPaid = () => {
        if (selectedTransactions.length === 0) {
            setAlertState({
                isOpen: true,
                message: 'Selecciona al menos una transacción',
                variant: 'warning'
            });
            return;
        }

        setPendingTransactionIds(selectedTransactions);
        setIsRangePayment(false);
        setPaymentMethod('');
        setPaymentProof(null);
        setPaymentProofPreview('');
        setIsPaymentMethodModalOpen(true);
    };

    const handleConfirmPaymentMethod = async () => {
        if (!paymentMethod) {
            setAlertState({
                isOpen: true,
                message: 'Debes seleccionar un método de pago',
                variant: 'warning'
            });
            return;
        }

        setIsPaymentMethodModalOpen(false);

        setConfirmState({
            isOpen: true,
            title: 'Confirmar marcado como pagado',
            message: `¿Estás seguro de marcar ${pendingTransactionIds.length} transacción(es) como pagada(s)? Esta acción no se puede deshacer.`,
            onConfirm: async () => {
                try {
                    if (isRangePayment) {
                        const result = await transactionsService.markDateRangeAsPaid(rangeStartDate, rangeEndDate, paymentMethod, paymentProof || undefined);
                        setAlertState({
                            isOpen: true,
                            message: `${result.affected || 0} transacción(es) marcada(s) como pagadas exitosamente`,
                            variant: 'success'
                        });
                    } else {
                        await transactionsService.markAsPaid(pendingTransactionIds, paymentMethod, paymentProof || undefined);
                        setAlertState({
                            isOpen: true,
                            message: 'Transacciones marcadas como pagadas exitosamente',
                            variant: 'success'
                        });
                    }
                    setConfirmState({ isOpen: false, title: '', message: '', onConfirm: () => { }, onCancel: () => { } });
                    setSelectedTransactions([]);
                    setPendingTransactionIds([]);
                    setPaymentMethod('');
                    fetchStats();
                    fetchTransactions();
                } catch (error) {
                    setConfirmState({ isOpen: false, title: '', message: '', onConfirm: () => { }, onCancel: () => { } });
                    setAlertState({
                        isOpen: true,
                        message: 'Error al marcar transacciones como pagadas',
                        variant: 'error'
                    });
                }
            }
        });
    };

    const handleMarkByDateRange = () => {
        setRangeStartDate('');
        setRangeEndDate('');
        setIsRangeModalOpen(true);
    };

    const handleConfirmMarkByDateRange = () => {
        if (!rangeStartDate || !rangeEndDate) {
            setAlertState({
                isOpen: true,
                message: 'Debes seleccionar ambas fechas',
                variant: 'warning'
            });
            return;
        }

        setIsRangeModalOpen(false);
        setIsRangePayment(true);
        setPaymentMethod('');
        setPaymentProof(null);
        setPaymentProofPreview('');
        setIsPaymentMethodModalOpen(true);
    };

    // 5. EARLY RETURNS (VALIDACIONES FINALES ANTES DEL RENDER)
    // Aquí es donde deben ir los bloqueos de renderizado, DESPUÉS de todos los hooks.

    // Si el usuario aún no está cargado, mostrar página vacía (no renderear nada)
    if (authLoading) {
        return null;
    }

    // Si el usuario no es válido (la redirección ocurre vía useEffect, pero evitamos render)
    if (!user || user.role !== 'vendedor' || (user.adminId !== 1 && user.adminId !== undefined && user.adminId !== null)) {
         // Si es un usuario logueado pero sin rol, mostramos la UI de acceso denegado
        if (user && user.role !== 'vendedor') {
            return (
                <div className="p-4 sm:p-8">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                        <h2 className="text-xl font-bold text-red-800 mb-2">Acceso Denegado</h2>
                        <p className="text-red-600">Esta sección solo está disponible para vendedores.</p>
                    </div>
                </div>
            );
        }
        return null;
    }

    // 6. RENDERIZADO PRINCIPAL
    return (
        <div className="p-4 sm:p-8 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Mi Deuda</h1>
                <p className="text-gray-600">
                    Visualiza el total de dinero que has recibido de transacciones completadas y que debes consignar.
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Total Debt Card */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-4 sm:p-8 text-white shadow-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-blue-100 text-sm font-medium mb-2">
                                {selectedPeriod === 'all' && 'Deuda Total'}
                                {selectedPeriod === 'today' && 'Deuda Hoy'}
                                {selectedPeriod === 'last15days' && 'Deuda Últimos 15 Días'}
                                {selectedPeriod === 'thisMonth' && 'Deuda Este Mes'}
                                {selectedPeriod === 'custom' && 'Deuda Rango Personalizado'}
                            </p>
                            <h2 className="text-5xl font-bold">
                                {statsLoading ? '...' : formatCurrency(totalDebt || 0)}
                            </h2>
                            <p className="text-blue-100 text-sm mt-2">
                                {transactions.length} transacción{transactions.length !== 1 ? 'es' : ''} completada{transactions.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <div className="bg-white/20 backdrop-blur-sm rounded-full p-6">
                            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Paid Amount Card */}
                <div className="bg-gradient-to-br from-green-600 to-teal-600 rounded-2xl p-4 sm:p-8 text-white shadow-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-green-100 text-sm font-medium mb-2">
                                {selectedPeriod === 'all' && 'Total Pagado Histórico'}
                                {selectedPeriod === 'today' && 'Pagado Hoy'}
                                {selectedPeriod === 'last15days' && 'Pagado Últimos 15 Días'}
                                {selectedPeriod === 'thisMonth' && 'Pagado Este Mes'}
                                {selectedPeriod === 'custom' && 'Pagado Rango Personalizado'}
                            </p>
                            <h2 className="text-5xl font-bold">
                                {statsLoading ? '...' : formatCurrency(paidAmount || 0)}
                            </h2>
                            <p className="text-green-100 text-sm mt-2">
                                Pagos realizados a la plataforma
                            </p>
                        </div>
                        <div className="bg-white/20 backdrop-blur-sm rounded-full p-6">
                            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </div>
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

            {/* Transactions Table */}
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

                <div className="p-6 border-b border-gray-200 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900">
                            {activeTab === 'unpaid' ? 'Transacciones Pendientes' : 'Transacciones Pagadas'}
                        </h3>
                    </div>

                    {activeTab === 'unpaid' && transactions.length > 0 && (
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={handleMarkSelectedAsPaid}
                                disabled={selectedTransactions.length === 0}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Marcar como pagadas ({selectedTransactions.length})
                            </button>

                            <button
                                onClick={handleMarkByDateRange}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Marcar por rango de fechas
                            </button>
                        </div>
                    )}
                </div>

                <TransactionList
                    transactions={transactions}
                    loading={loading}
                    pagination={pagination}
                    onPageChange={setPage}
                    showSelection={activeTab === 'unpaid'}
                    selectedTransactions={selectedTransactions}
                    onSelectTransaction={handleSelectTransaction}
                    onSelectAll={handleSelectAll}
                    showPaymentActions={activeTab === 'paid'}
                    onUnmarkPaid={handleUnmarkPaid}
                    onEditPayment={handleEditPayment}
                />
            </div>

            {/* Range Date Modal */}
            <Modal
                isOpen={isRangeModalOpen}
                onClose={() => setIsRangeModalOpen(false)}
                title="Marcar por rango de fechas"
                size="md"
            >
                <div className="space-y-4">
                    <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                        <div className="flex gap-3">
                            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                                <p className="text-sm font-medium text-yellow-900">Advertencia</p>
                                <p className="text-xs text-yellow-800 mt-1">
                                    Todas las transacciones completadas dentro del rango seleccionado serán marcadas como pagadas. Esta acción no se puede deshacer.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Fecha Inicio *
                        </label>
                        <input
                            type="date"
                            value={rangeStartDate}
                            onChange={(e) => setRangeStartDate(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Fecha Fin *
                        </label>
                        <input
                            type="date"
                            value={rangeEndDate}
                            onChange={(e) => setRangeEndDate(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            onClick={() => setIsRangeModalOpen(false)}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmMarkByDateRange}
                            disabled={!rangeStartDate || !rangeEndDate}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Payment Method Modal */}
            <Modal
                isOpen={isPaymentMethodModalOpen}
                onClose={() => setIsPaymentMethodModalOpen(false)}
                title="Confirmar Pago"
                size="md"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Método de Pago *
                        </label>
                        <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value as any)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none bg-white"
                        >
                            <option value="">Selecciona un método</option>
                            <option value="efectivo">Efectivo</option>
                            <option value="consignacion_nequi">Consignación Nequi</option>
                            <option value="consignacion_bancolombia">Consignación Bancolombia</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Comprobante (Opcional)
                        </label>
                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 transition-colors">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        setPaymentProof(file);
                                        const reader = new FileReader();
                                        reader.onloadend = () => {
                                            setPaymentProofPreview(reader.result as string);
                                        };
                                        reader.readAsDataURL(file);
                                    }
                                }}
                                className="hidden"
                                id="payment-proof"
                            />
                            <label htmlFor="payment-proof" className="cursor-pointer block">
                                {paymentProofPreview ? (
                                    <div className="relative w-full h-48">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={paymentProofPreview}
                                            alt="Preview"
                                            className="w-full h-full object-contain rounded-lg"
                                        />
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setPaymentProof(null);
                                                setPaymentProofPreview('');
                                            }}
                                            className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-sm text-gray-500">Clic para subir imagen</span>
                                    </div>
                                )}
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            onClick={() => setIsPaymentMethodModalOpen(false)}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmPaymentMethod}
                            disabled={!paymentMethod}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Edit Payment Modal */}
            <Modal
                isOpen={isEditPaymentModalOpen}
                onClose={() => setIsEditPaymentModalOpen(false)}
                title="Editar Pago"
                size="md"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Método de Pago
                        </label>
                        <select
                            value={editPaymentMethod}
                            onChange={(e) => setEditPaymentMethod(e.target.value as any)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none bg-white"
                        >
                            <option value="">Selecciona un método</option>
                            <option value="efectivo">Efectivo</option>
                            <option value="consignacion_nequi">Consignación Nequi</option>
                            <option value="consignacion_bancolombia">Consignación Bancolombia</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nuevo Comprobante
                        </label>
                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 transition-colors">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleEditPaymentProofChange}
                                className="hidden"
                                id="edit-payment-proof"
                            />
                            <label htmlFor="edit-payment-proof" className="cursor-pointer block">
                                {editPaymentProofPreview ? (
                                    <div className="relative w-full h-48">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={editPaymentProofPreview}
                                            alt="Preview"
                                            className="w-full h-full object-contain rounded-lg"
                                        />
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setEditPaymentProof(null);
                                                setEditPaymentProofPreview('');
                                            }}
                                            className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-sm text-gray-500">Clic para cambiar imagen</span>
                                    </div>
                                )}
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            onClick={() => setIsEditPaymentModalOpen(false)}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmEditPayment}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                        >
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Global Alerts */}
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
                onCancel={() => setConfirmState({ isOpen: false, title: '', message: '', onConfirm: () => { }, onCancel: () => { } })}
            />
        </div>
    );
}