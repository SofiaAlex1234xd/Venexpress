'use client';

import { useState, useEffect } from 'react';
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
    const { user } = useAuth();
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
    const [confirmState, setConfirmState] = useState<{ isOpen: boolean; message: string; onConfirm: () => void }>({
        isOpen: false,
        message: '',
        onConfirm: () => { }
    });

    const fetchStats = async () => {
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

            const data = await transactionsService.getVendorHistory(query);
            setTransactions(data.data);
            setPagination(data.meta);
        } catch (error) {
            console.error('Error fetching transactions:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedPeriod !== 'custom') {
            fetchStats();
        }
    }, [selectedPeriod, startDate, endDate]);

    useEffect(() => {
        if (selectedPeriod !== 'custom' || (startDate && endDate)) {
            fetchTransactions();
        }
    }, [selectedPeriod, startDate, endDate, activeTab, page]);

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
            message: `¿Estás seguro de marcar ${pendingTransactionIds.length} transacción(es) como pagada(s)? Esta acción no se puede deshacer.`,
            onConfirm: async () => {
                try {
                    if (isRangePayment) {
                        const result = await transactionsService.markDateRangeAsPaid(rangeStartDate, rangeEndDate, paymentMethod);
                        setAlertState({
                            isOpen: true,
                            message: `${result.affected || 0} transacción(es) marcada(s) como pagadas exitosamente`,
                            variant: 'success'
                        });
                    } else {
                        await transactionsService.markAsPaid(pendingTransactionIds, paymentMethod);
                        setAlertState({
                            isOpen: true,
                            message: 'Transacciones marcadas como pagadas exitosamente',
                            variant: 'success'
                        });
                    }
                    setConfirmState({ isOpen: false, message: '', onConfirm: () => { } });
                    setSelectedTransactions([]);
                    setPendingTransactionIds([]);
                    setPaymentMethod('');
                    fetchStats();
                    fetchTransactions();
                } catch (error) {
                    setConfirmState({ isOpen: false, message: '', onConfirm: () => { } });
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

    if (user?.role !== 'vendedor') {
        return (
            <div className="p-4 sm:p-8">
                <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-red-800 mb-2">Acceso Denegado</h2>
                    <p className="text-red-600">Esta sección solo está disponible para vendedores.</p>
                </div>
            </div>
        );
    }

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

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <button
                            onClick={() => setIsRangeModalOpen(false)}
                            className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmMarkByDateRange}
                            disabled={!rangeStartDate || !rangeEndDate}
                            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
                        >
                            Marcar como pagadas
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Alert Dialog */}
            <Alert
                isOpen={alertState.isOpen}
                message={alertState.message}
                variant={alertState.variant}
                onClose={() => setAlertState({ ...alertState, isOpen: false })}
            />

            {/* Payment Method Modal */}
            <Modal
                isOpen={isPaymentMethodModalOpen}
                onClose={() => {
                    setIsPaymentMethodModalOpen(false);
                    setPaymentMethod('');
                    setPaymentProof(null);
                    setPaymentProofPreview('');
                }}
                title="Seleccionar método de pago"
                size="md"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Selecciona cómo realizaste el pago de {isRangePayment ? 'las transacciones' : 'la(s) transacción(es)'}:
                    </p>

                    <div className="space-y-2">
                        <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                            <input
                                type="radio"
                                name="paymentMethod"
                                value="efectivo"
                                checked={paymentMethod === 'efectivo'}
                                onChange={(e) => setPaymentMethod(e.target.value as any)}
                                className="mr-3 w-4 h-4 text-blue-600"
                            />
                            <div>
                                <p className="font-medium text-gray-900">Efectivo</p>
                                <p className="text-xs text-gray-500">Pago realizado en efectivo</p>
                            </div>
                        </label>

                        <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                            <input
                                type="radio"
                                name="paymentMethod"
                                value="consignacion_nequi"
                                checked={paymentMethod === 'consignacion_nequi'}
                                onChange={(e) => setPaymentMethod(e.target.value as any)}
                                className="mr-3 w-4 h-4 text-blue-600"
                            />
                            <div>
                                <p className="font-medium text-gray-900">Consignación Nequi</p>
                                <p className="text-xs text-gray-500">Pago realizado por Nequi</p>
                            </div>
                        </label>

                        <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                            <input
                                type="radio"
                                name="paymentMethod"
                                value="consignacion_bancolombia"
                                checked={paymentMethod === 'consignacion_bancolombia'}
                                onChange={(e) => setPaymentMethod(e.target.value as any)}
                                className="mr-3 w-4 h-4 text-blue-600"
                            />
                            <div>
                                <p className="font-medium text-gray-900">Consignación Bancolombia</p>
                                <p className="text-xs text-gray-500">Pago realizado por Bancolombia</p>
                            </div>
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Comprobante de Pago (Opcional)
                        </label>
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    setPaymentProof(file);
                                    if (file.type.startsWith('image/')) {
                                        setPaymentProofPreview(URL.createObjectURL(file));
                                    } else {
                                        setPaymentProofPreview('');
                                    }
                                }
                            }}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                        />
                        {paymentProofPreview && (
                            <div className="mt-3">
                                <img src={paymentProofPreview} alt="Preview" className="max-h-48 rounded-lg border border-gray-200" />
                            </div>
                        )}
                        {!paymentProofPreview && paymentProof && (
                            <p className="mt-2 text-sm text-blue-600 font-medium">
                                Archivo seleccionado: {paymentProof.name}
                            </p>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                            Puedes subir una imagen (JPG, PNG) o un PDF del comprobante de pago
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <button
                            onClick={() => {
                                setIsPaymentMethodModalOpen(false);
                                setPaymentMethod('');
                                setPaymentProof(null);
                                setPaymentProofPreview('');
                            }}
                            className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmPaymentMethod}
                            disabled={!paymentMethod}
                            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={confirmState.isOpen}
                title="Confirmar acción"
                message={confirmState.message}
                confirmText="Sí, marcar como pagadas"
                cancelText="Cancelar"
                variant="warning"
                onConfirm={confirmState.onConfirm}
                onCancel={() => setConfirmState({ isOpen: false, message: '', onConfirm: () => { } })}
            />
        </div>
    );
}
