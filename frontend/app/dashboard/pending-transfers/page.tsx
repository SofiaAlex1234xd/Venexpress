'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Alert from '@/components/ui/Alert';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { transactionsService } from '@/services/transactions.service';
import { Transaction } from '@/types/transaction';

const REJECTION_REASONS = [
    { value: 'cuenta_incorrecta', label: 'Número de cuenta incorrecto' },
    { value: 'cedula_incorrecta', label: 'Cédula incorrecta' },
    { value: 'banco_incorrecto', label: 'Banco incorrecto' },
    { value: 'datos_incompletos', label: 'Datos incompletos' },
    { value: 'beneficiario_no_encontrado', label: 'Beneficiario no encontrado' },
    { value: 'limite_excedido', label: 'Límite excedido' },
    { value: 'otro', label: 'Otro motivo' },
];

export default function PendingTransfersPage() {
    const { user, loading: authLoading } = useAuth();
    const isAdminColombia = user?.role === 'admin_colombia';
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    // Complete modal states
    const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
    const [completeVoucher, setCompleteVoucher] = useState<File | null>(null);
    const [completeVoucherPreview, setCompleteVoucherPreview] = useState<string>('');

    // Reject modal states
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectCustomReason, setRejectCustomReason] = useState('');
    const [rejectVoucher, setRejectVoucher] = useState<File | null>(null);
    const [rejectVoucherPreview, setRejectVoucherPreview] = useState<string>('');

    // Cancel modal states
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState('');

    const [processing, setProcessing] = useState(false);
    const [alertState, setAlertState] = useState<{ isOpen: boolean; message: string; variant?: 'error' | 'success' | 'warning' | 'info' }>({
        isOpen: false,
        message: '',
        variant: 'info'
    });

    useEffect(() => {
        if (!authLoading && user) {
            loadTransactions();

            const intervalId = setInterval(() => {
                loadTransactions();
            }, 60_000);

            return () => clearInterval(intervalId);
        }
    }, [authLoading, user]);

    const loadTransactions = async () => {
        try {
            setLoading(true);
            let data: Transaction[] = [];
            if (user?.role === 'admin_colombia') {
                data = await transactionsService.getPendingAdminColombia();
            } else {
                data = await transactionsService.getPendingVenezuela();
            }
            setTransactions(data);
            setCurrentPage(1); // Reset to first page when loading new data
        } catch (error) {
            console.error('Error loading transactions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'complete' | 'reject') => {
        const file = e.target.files?.[0];
        if (file) {
            if (type === 'complete') {
                setCompleteVoucher(file);
                setCompleteVoucherPreview(URL.createObjectURL(file));
            } else {
                setRejectVoucher(file);
                setRejectVoucherPreview(URL.createObjectURL(file));
            }
        }
    };

    const openCompleteModal = (transaction: Transaction) => {
        setSelectedTransaction(transaction);
        setCompleteVoucher(null);
        setCompleteVoucherPreview('');
        setIsCompleteModalOpen(true);
    };

    const openRejectModal = (transaction: Transaction) => {
        setSelectedTransaction(transaction);
        setRejectReason('');
        setRejectCustomReason('');
        setRejectVoucher(null);
        setRejectVoucherPreview('');
        setIsRejectModalOpen(true);
    };

    const openCancelModal = (transaction: Transaction) => {
        setSelectedTransaction(transaction);
        setCancelReason('');
        setIsCancelModalOpen(true);
    };

    const handleComplete = async () => {
        if (!selectedTransaction) return;

        setProcessing(true);
        try {
            await transactionsService.completeTransfer(selectedTransaction.id, completeVoucher || undefined);
            setIsCompleteModalOpen(false);
            setAlertState({
                isOpen: true,
                message: 'Transferencia completada exitosamente',
                variant: 'success'
            });
            await loadTransactions();
        } catch (error: any) {
            setAlertState({
                isOpen: true,
                message: error.response?.data?.message || 'Error al completar la transferencia',
                variant: 'error'
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!selectedTransaction || !rejectReason) {
            setAlertState({
                isOpen: true,
                message: 'Selecciona un motivo de rechazo',
                variant: 'warning'
            });
            return;
        }

        const reason = rejectReason === 'otro' ? rejectCustomReason : REJECTION_REASONS.find(r => r.value === rejectReason)?.label || rejectReason;

        if (rejectReason === 'otro' && !rejectCustomReason.trim()) {
            setAlertState({
                isOpen: true,
                message: 'Especifica el motivo del rechazo',
                variant: 'warning'
            });
            return;
        }

        setProcessing(true);
        try {
            await transactionsService.rejectTransfer(selectedTransaction.id, reason, rejectVoucher || undefined);
            setIsRejectModalOpen(false);
            setAlertState({
                isOpen: true,
                message: 'Transferencia rechazada',
                variant: 'success'
            });
            await loadTransactions();
        } catch (error: any) {
            setAlertState({
                isOpen: true,
                message: error.response?.data?.message || 'Error al rechazar la transferencia',
                variant: 'error'
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleCancel = async () => {
        if (!selectedTransaction) return;

        if (!cancelReason.trim()) {
            setAlertState({
                isOpen: true,
                message: 'Especifica el motivo de la cancelación',
                variant: 'warning'
            });
            return;
        }

        setProcessing(true);
        try {
            await transactionsService.cancelByAdmin(selectedTransaction.id, cancelReason);
            setIsCancelModalOpen(false);
            setAlertState({
                isOpen: true,
                message: 'Transferencia cancelada por administrador',
                variant: 'success'
            });
            await loadTransactions();
        } catch (error: any) {
            setAlertState({
                isOpen: true,
                message: error.response?.data?.message || 'Error al cancelar la transferencia',
                variant: 'error'
            });
        } finally {
            setProcessing(false);
        }
    };

    const formatCurrency = (amount: number, currency: 'COP' | 'Bs') => {
        if (currency === 'COP') {
            return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
        }
        return `${amount.toFixed(2)} Bs`;
    };

    const handleCopyToClipboard = (transactionToCopy?: any) => {
        const tx = transactionToCopy && transactionToCopy.id ? transactionToCopy : selectedTransaction;
        if (!tx) return;

        const isPagoMovil = tx.beneficiaryIsPagoMovil;
        const amountCOP = formatCurrency(Number(tx.amountCOP), 'COP');
        const amountBs = formatCurrency(Number(tx.amountBs), 'Bs');
        const rate = tx.saleRate != null && !isNaN(Number(tx.saleRate))
            ? Number(tx.saleRate).toFixed(2)
            : '-';
        const date = new Date(tx.createdAt).toLocaleString('es-CO');

        let text = `*DATOS DE TRANSFERENCIA*\n\n`;
        text += `Fecha: ${date}\n`;
        text += `Beneficiario: ${tx.beneficiaryFullName}\n`;
        text += `Cédula: ${tx.beneficiaryDocumentId}\n`;
        text += `Banco: ${tx.beneficiaryBankName}\n`;

        if (isPagoMovil) {
            text += `Teléfono (Pago Móvil): ${tx.beneficiaryPhone}\n`;
        } else {
            text += `Cuenta: ${tx.beneficiaryAccountNumber}\n`;
            if (tx.beneficiaryAccountType) {
                text += `Tipo: ${tx.beneficiaryAccountType}\n`;
            }
            if (tx.beneficiaryPhone) {
                text += `Teléfono: ${tx.beneficiaryPhone}\n`;
            }
        }

        text += `\nTasa: ${rate}\n`;
        text += `Monto COP: ${amountCOP}\n`;
        text += `Monto Bs: ${amountBs}`;

        navigator.clipboard.writeText(text).then(() => {
            setAlertState({
                isOpen: true,
                message: 'Datos copiados al portapapeles',
                variant: 'success'
            });

            // Auto hide alert
            setTimeout(() => setAlertState(prev => ({ ...prev, isOpen: false })), 2000);
        }).catch(err => {
            console.error('Error al copiar:', err);
            setAlertState({
                isOpen: true,
                message: 'Error al copiar datos',
                variant: 'error'
            });
        });
    };

    if (user?.role !== 'admin_venezuela' && user?.role !== 'admin_colombia') {
        return (
            <div className="p-4 sm:p-8">
                <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-red-800 mb-2">Acceso Denegado</h2>
                    <p className="text-red-600">Esta sección solo está disponible para administradores.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Giros Pendientes</h1>
                    <p className="text-gray-600">Gestiona las transferencias pendientes de procesar en Venezuela.</p>
                </div>
                <Button onClick={loadTransactions} variant="outline">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Actualizar
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <p className="text-xs text-yellow-600 font-medium mb-1">Pendientes</p>
                    <p className="text-2xl font-bold text-yellow-900">{transactions.length}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <p className="text-xs text-green-600 font-medium mb-1">Total COP</p>
                    <p className="text-lg font-bold text-green-900">
                        {formatCurrency(transactions.reduce((sum, t) => sum + Number(t.amountCOP), 0), 'COP')}
                    </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-xs text-blue-600 font-medium mb-1">Total Bs</p>
                    <p className="text-lg font-bold text-blue-900">
                        {formatCurrency(transactions.reduce((sum, t) => sum + Number(t.amountBs), 0), 'Bs')}
                    </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <p className="text-xs text-purple-600 font-medium mb-1">Vendedores</p>
                    <p className="text-2xl font-bold text-purple-900">
                        {new Set(transactions.map(t => t.createdBy.id)).size}
                    </p>
                </div>
            </div>

            {/* Transactions List */}
            <Card>
                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-600"></div>
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="text-center py-12">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-gray-500 text-lg">No hay transferencias pendientes</p>
                        <p className="text-gray-400 text-sm mt-1">Todas las transferencias han sido procesadas</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-4">
                            {transactions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((transaction) => (
                                <div key={transaction.id} className="relative border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                                    <button
                                        onClick={() => handleCopyToClipboard(transaction)}
                                        className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all z-10"
                                        title="Copiar datos"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                        </svg>
                                    </button>
                                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                        {/* Transaction Info */}
                                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">ID / Fecha</p>
                                                <p className="font-semibold text-gray-900">#{transaction.id}</p>
                                                <p className="text-xs text-gray-500">{new Date(transaction.createdAt).toLocaleString('es-CO')}</p>
                                            </div>

                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">Beneficiario</p>
                                                <p className="font-semibold text-gray-900 truncate">{transaction.beneficiaryFullName}</p>
                                                <p className="text-xs text-gray-500">{transaction.beneficiaryDocumentId}</p>
                                            </div>

                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">Banco / Cuenta</p>
                                                <p className="font-semibold text-gray-900">{transaction.beneficiaryBankName}</p>
                                                <p className="text-xs text-gray-500 font-mono">{transaction.beneficiaryAccountNumber}</p>
                                            </div>

                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">Montos</p>
                                                <p className="font-bold text-green-600">{formatCurrency(Number(transaction.amountCOP), 'COP')}</p>
                                                <p className="text-sm font-semibold text-blue-600">{formatCurrency(Number(transaction.amountBs), 'Bs')}</p>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        {!isAdminColombia && (
                                            <div className="flex flex-col sm:flex-row gap-2 lg:w-auto">
                                                <Button
                                                    size="sm"
                                                    onClick={() => openCompleteModal(transaction)}
                                                    className="bg-green-600 hover:bg-green-700"
                                                >
                                                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    Completar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => openRejectModal(transaction)}
                                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                                >
                                                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                    Rechazar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => openCancelModal(transaction)}
                                                    className="text-gray-600"
                                                >
                                                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                    Cancelar
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Additional Info */}
                                    <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-4 text-sm">
                                        <span className="text-gray-500">
                                            Vendedor: <span className="text-gray-900 font-medium">{transaction.createdBy.name}</span>
                                        </span>
                                        <span className="text-gray-500">
                                            Tasa:{' '}
                                            <span className="text-gray-900 font-medium">
                                                {transaction.saleRate != null && !isNaN(Number(transaction.saleRate))
                                                    ? Number(transaction.saleRate).toFixed(2)
                                                    : '-'}
                                            </span>
                                        </span>
                                        <span className="text-gray-500">
                                            Tipo cuenta: <span className="text-gray-900 font-medium capitalize">{transaction.beneficiaryAccountType}</span>
                                        </span>
                                        {transaction.notes && (
                                            <span className="text-gray-500">
                                                Notas: <span className="text-gray-900">{transaction.notes}</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {Math.ceil(transactions.length / itemsPerPage) > 1 && (
                            <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
                                <div className="text-sm text-gray-600">
                                    Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, transactions.length)} de {transactions.length}
                                </div>
                                <div className="flex gap-1 sm:gap-2">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="px-2 sm:px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                        aria-label="Página anterior"
                                    >
                                        <svg className="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                        <span className="hidden sm:inline">Anterior</span>
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(transactions.length / itemsPerPage), prev + 1))}
                                        disabled={currentPage === Math.ceil(transactions.length / itemsPerPage)}
                                        className="px-2 sm:px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                        aria-label="Página siguiente"
                                    >
                                        <span className="hidden sm:inline">Siguiente</span>
                                        <svg className="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Card>

            {/* Complete Modal */}
            <Modal
                isOpen={isCompleteModalOpen}
                onClose={() => setIsCompleteModalOpen(false)}
                title="Completar Transferencia"
                size="lg"
            >
                {selectedTransaction && (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                            <div>
                                <p className="text-sm text-gray-500">ID de Transacción</p>
                                <p className="text-2xl font-bold text-gray-900">#{selectedTransaction.id}</p>
                            </div>
                            <Badge status={selectedTransaction.status} />
                        </div>

                        {/* Amounts */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                                <p className="text-xs text-green-600 font-medium mb-1">Monto COP</p>
                                <p className="text-2xl font-bold text-green-900">
                                    {formatCurrency(Number(selectedTransaction.amountCOP), 'COP')}
                                </p>
                            </div>
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                <p className="text-xs text-blue-600 font-medium mb-1">Monto a Pagar (Bs)</p>
                                <p className="text-2xl font-bold text-blue-900">
                                    {formatCurrency(Number(selectedTransaction.amountBs), 'Bs')}
                                </p>
                            </div>
                        </div>

                        {/* Beneficiary Details */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-gray-900">Datos del Destinatario</h4>
                                    {selectedTransaction.beneficiaryIsPagoMovil && (
                                        <span className="px-3 py-1 text-xs font-bold bg-blue-600 text-white rounded-full flex items-center gap-1">
                                            📱 PAGO MÓVIL
                                        </span>
                                    )}
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleCopyToClipboard(selectedTransaction)}
                                    className="text-blue-600 border-blue-200 hover:bg-blue-50 py-1"
                                    title="Copiar datos al portapapeles"
                                >
                                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                    </svg>
                                    Copiar
                                </Button>
                            </div>

                            {selectedTransaction.beneficiaryIsPagoMovil ? (
                                // Layout para Pago Móvil
                                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-xs text-blue-600 font-medium">Nombre Completo</p>
                                            <p className="font-semibold text-gray-900">{selectedTransaction.beneficiaryFullName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-blue-600 font-medium">Cédula</p>
                                            <p className="font-semibold text-gray-900">{selectedTransaction.beneficiaryDocumentId}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-blue-600 font-medium">Banco</p>
                                            <p className="font-semibold text-gray-900">{selectedTransaction.beneficiaryBankName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-blue-600 font-medium">📱 Teléfono Pago Móvil</p>
                                            <p className="font-mono text-base font-bold text-blue-900">{selectedTransaction.beneficiaryPhone || '-'}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                // Layout para Transferencia Bancaria
                                <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-xs text-gray-500">Nombre Completo</p>
                                            <p className="font-medium text-gray-900">{selectedTransaction.beneficiaryFullName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">Cédula</p>
                                            <p className="font-medium text-gray-900">{selectedTransaction.beneficiaryDocumentId}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">Banco</p>
                                            <p className="font-medium text-gray-900">{selectedTransaction.beneficiaryBankName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">Número de Cuenta</p>
                                            <p className="font-mono text-sm text-gray-900">{selectedTransaction.beneficiaryAccountNumber || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">Tipo de Cuenta</p>
                                            <p className="font-medium text-gray-900 capitalize">{selectedTransaction.beneficiaryAccountType || '-'}</p>
                                        </div>
                                        {selectedTransaction.beneficiaryPhone && (
                                            <div>
                                                <p className="text-xs text-gray-500">Teléfono</p>
                                                <p className="font-medium text-gray-900">{selectedTransaction.beneficiaryPhone}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Transaction Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-500 mb-1">Tasa Usada</p>
                                <p className="font-semibold text-gray-900">
                                    {selectedTransaction.saleRate != null && !isNaN(Number(selectedTransaction.saleRate))
                                        ? Number(selectedTransaction.saleRate).toFixed(2)
                                        : '-'}
                                </p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-500 mb-1">Vendedor</p>
                                <p className="font-semibold text-gray-900">{selectedTransaction.createdBy.name}</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-500 mb-1">Fecha</p>
                                <p className="font-semibold text-gray-900">
                                    {new Date(selectedTransaction.createdAt).toLocaleDateString('es-CO')}
                                </p>
                            </div>
                        </div>

                        {selectedTransaction.notes && (
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                <p className="text-xs text-blue-600 font-medium mb-1">Notas</p>
                                <p className="text-sm text-blue-900">{selectedTransaction.notes}</p>
                            </div>
                        )}

                        {/* Voucher Upload */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Comprobante de pago (opcional)
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFileChange(e, 'complete')}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                            />
                            {completeVoucherPreview && (
                                <div className="mt-3">
                                    <img src={completeVoucherPreview} alt="Preview" className="max-h-48 rounded-lg border border-gray-200" />
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4 border-t border-gray-200">
                            <Button
                                variant="outline"
                                onClick={() => setIsCompleteModalOpen(false)}
                                className="flex-1"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleComplete}
                                isLoading={processing}
                                className="flex-1 bg-green-600 hover:bg-green-700"
                            >
                                Confirmar Completado
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Reject Modal */}
            <Modal
                isOpen={isRejectModalOpen}
                onClose={() => setIsRejectModalOpen(false)}
                title="Rechazar Transferencia"
                size="md"
            >
                {selectedTransaction && (
                    <div className="space-y-4">
                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                            <p className="text-sm text-red-900">
                                <span className="font-semibold">Transferencia #{selectedTransaction.id}</span>
                            </p>
                            <p className="text-lg font-bold text-red-900 mt-1">
                                {formatCurrency(Number(selectedTransaction.amountBs), 'Bs')}
                            </p>
                            <p className="text-sm text-red-700 mt-1">
                                Para: {selectedTransaction.beneficiaryFullName}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Motivo del rechazo *
                            </label>
                            <select
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                            >
                                <option value="">Selecciona un motivo</option>
                                {REJECTION_REASONS.map((reason) => (
                                    <option key={reason.value} value={reason.value}>
                                        {reason.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {rejectReason === 'otro' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Especifica el motivo *
                                </label>
                                <textarea
                                    value={rejectCustomReason}
                                    onChange={(e) => setRejectCustomReason(e.target.value)}
                                    placeholder="Describe el motivo del rechazo..."
                                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all resize-none"
                                    rows={3}
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Imagen del error (opcional)
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFileChange(e, 'reject')}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                            />
                            {rejectVoucherPreview && (
                                <div className="mt-3">
                                    <img src={rejectVoucherPreview} alt="Preview" className="max-h-48 rounded-lg" />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button
                                variant="outline"
                                onClick={() => setIsRejectModalOpen(false)}
                                className="flex-1"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleReject}
                                isLoading={processing}
                                className="flex-1 bg-red-600 hover:bg-red-700"
                            >
                                Confirmar Rechazo
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Cancel Modal */}
            <Modal
                isOpen={isCancelModalOpen}
                onClose={() => setIsCancelModalOpen(false)}
                title="Cancelar Transferencia"
                size="md"
            >
                {selectedTransaction && (
                    <div className="space-y-4">
                        <div className="p-4 bg-gray-100 border border-gray-200 rounded-xl">
                            <p className="text-sm text-gray-700">
                                <span className="font-semibold">Transferencia #{selectedTransaction.id}</span>
                            </p>
                            <p className="text-lg font-bold text-gray-900 mt-1">
                                {formatCurrency(Number(selectedTransaction.amountBs), 'Bs')}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                                Para: {selectedTransaction.beneficiaryFullName}
                            </p>
                        </div>

                        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                            <div className="flex gap-3">
                                <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div>
                                    <p className="text-sm font-medium text-yellow-900">Advertencia</p>
                                    <p className="text-xs text-yellow-800 mt-1">
                                        Esta acción cancelará la transferencia permanentemente. El estado cambiará a "Cancelado por administrador".
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Motivo de la cancelación *
                            </label>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Describe el motivo de la cancelación..."
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all resize-none"
                                rows={3}
                            />
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button
                                variant="outline"
                                onClick={() => setIsCancelModalOpen(false)}
                                className="flex-1"
                            >
                                Volver
                            </Button>
                            <Button
                                onClick={handleCancel}
                                isLoading={processing}
                                className="flex-1 bg-gray-600 hover:bg-gray-700"
                            >
                                Confirmar Cancelación
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Alert */}
            <Alert
                isOpen={alertState.isOpen}
                message={alertState.message}
                variant={alertState.variant}
                onClose={() => setAlertState({ ...alertState, isOpen: false })}
            />
        </div>
    );
}

