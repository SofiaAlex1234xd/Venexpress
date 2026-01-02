'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { transactionsService } from '@/services/transactions.service';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Alert from '@/components/ui/Alert';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getLocalDateString } from '@/utils/date';

interface TransactionDetail {
  id: number;
  createdAt: string;
  vendorName: string;
  beneficiaryFullName: string;
  amountCOP: number;
  amountBs: number;
  saleRate: number;
  purchaseRate: number;
  inversion: number;
  gananciaSistema: number;
  gananciaAdminColombia: number;
  gananciaAdminVenezuela: number;
  deudaConVenezuela: number;
}

interface PaymentDetail {
  id: number;
  amount: number;
  notes: string;
  proofUrl: string;
  createdBy: string;
  createdAt: string;
  paymentDate: string;
}

interface DebtSummary {
  totalDebt: number;
  totalPaid: number;
  pendingDebt: number;
  transactionDetails: TransactionDetail[];
  payments: PaymentDetail[];
}

export default function VenezuelaDebtPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [debtSummary, setDebtSummary] = useState<DebtSummary | null>(null);
  const [filters, setFilters] = useState<{ startDate: string; endDate: string }>(() => {
    const today = getLocalDateString();
    return { startDate: today, endDate: today };
  });
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    notes: '',
    paymentDate: getLocalDateString(),
  });
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [showTransactionDetails, setShowTransactionDetails] = useState(false);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    message: string;
    variant?: 'error' | 'success' | 'warning' | 'info';
  }>({
    isOpen: false,
    message: '',
    variant: 'info',
  });
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    if (user?.role === 'admin_colombia') {
      loadDebtDetail();

      // Actualizar cada minuto
      const intervalId = setInterval(() => {
        loadDebtDetail();
      }, 60_000);

      return () => clearInterval(intervalId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filters.startDate, filters.endDate]);

  const loadDebtDetail = async () => {
    try {
      setLoading(true);
      const data = await transactionsService.getVenezuelaDebtDetail(
        filters.startDate,
        filters.endDate
      );
      setDebtSummary(data);
    } catch (error) {
      console.error('Error loading debt detail:', error);
      setAlertState({
        isOpen: true,
        message: 'Error al cargar el detalle de la deuda',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePayFull = () => {
    if (!debtSummary) return;
    setPaymentForm({
      amount: debtSummary.pendingDebt.toString(),
      notes: 'Pago completo de deuda',
      paymentDate: getLocalDateString(),
    });
    setPaymentProof(null);
    setPaymentProofPreview('');
    setIsPaymentModalOpen(true);
  };

  const handlePayPartial = () => {
    setPaymentForm({
      amount: '',
      notes: '',
      paymentDate: getLocalDateString(),
    });
    setPaymentProof(null);
    setPaymentProofPreview('');
    setIsPaymentModalOpen(true);
  };

  const handleSubmitPayment = async () => {
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      setAlertState({
        isOpen: true,
        message: 'El monto debe ser mayor a 0',
        variant: 'warning',
      });
      return;
    }

    setConfirmState({
      isOpen: true,
      message: `¿Confirmar pago de ${formatCOP(Number(paymentForm.amount))} a Admin Venezuela?`,
      onConfirm: async () => {
        try {
          setSubmitting(true);
          await transactionsService.createVenezuelaPayment({
            amount: Number(paymentForm.amount),
            notes: paymentForm.notes,
            paymentDate: paymentForm.paymentDate,
            proof: paymentProof || undefined,
          });
          setConfirmState({ isOpen: false, message: '', onConfirm: () => {} });
          setIsPaymentModalOpen(false);
          setPaymentProof(null);
          setPaymentProofPreview('');
          setAlertState({
            isOpen: true,
            message: 'Pago registrado exitosamente',
            variant: 'success',
          });
          await loadDebtDetail();
        } catch (error) {
          console.error('Error submitting payment:', error);
          setConfirmState({ isOpen: false, message: '', onConfirm: () => {} });
          setAlertState({
            isOpen: true,
            message: 'Error al registrar el pago',
            variant: 'error',
          });
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleDeletePayment = (paymentId: number, amount: number) => {
    setConfirmState({
      isOpen: true,
      message: `¿Eliminar el pago de ${formatCOP(amount)}? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await transactionsService.deleteVenezuelaPayment(paymentId);
          setConfirmState({ isOpen: false, message: '', onConfirm: () => {} });
          setAlertState({
            isOpen: true,
            message: 'Pago eliminado exitosamente',
            variant: 'success',
          });
          await loadDebtDetail();
        } catch (error) {
          console.error('Error deleting payment:', error);
          setConfirmState({ isOpen: false, message: '', onConfirm: () => {} });
          setAlertState({
            isOpen: true,
            message: 'Error al eliminar el pago',
            variant: 'error',
          });
        }
      },
    });
  };

  const formatCOP = (value: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (user?.role !== 'admin_colombia') {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <p className="text-sm text-red-600 font-medium">
            Esta sección solo está disponible para Admin Colombia.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Deuda con Admin Venezuela
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Gestiona los pagos que debes realizar a Admin Venezuela basados en las
          transacciones completadas.
        </p>
      </div>

      {/* Filtros de fecha */}
      <Card>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Período</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Fecha desde
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, startDate: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Fecha hasta
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, endDate: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = getLocalDateString();
                setFilters({ startDate: today, endDate: today });
              }}
              className="flex-1"
            >
              Hoy
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={loadDebtDetail}
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Cargando...' : 'Aplicar'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Resumen de deuda */}
      {debtSummary && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-red-600 to-rose-600 text-white">
              <p className="text-red-100 text-sm font-medium mb-2">
                Deuda Total
              </p>
              <p className="text-4xl font-bold">
                {formatCOP(debtSummary.totalDebt)}
              </p>
              <p className="text-red-100 text-xs mt-2">
                {debtSummary.transactionDetails.length} transacciones
              </p>
            </Card>

            <Card className="bg-gradient-to-br from-green-600 to-emerald-600 text-white">
              <p className="text-green-100 text-sm font-medium mb-2">
                Total Pagado
              </p>
              <p className="text-4xl font-bold">
                {formatCOP(debtSummary.totalPaid)}
              </p>
              <p className="text-green-100 text-xs mt-2">
                {debtSummary.payments.length} pagos realizados
              </p>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white">
              <p className="text-amber-100 text-sm font-medium mb-2">
                Saldo Pendiente
              </p>
              <p className="text-4xl font-bold">
                {formatCOP(debtSummary.pendingDebt)}
              </p>
              <p className="text-amber-100 text-xs mt-2">Por pagar</p>
            </Card>
          </div>

          {/* Acciones de pago */}
          {debtSummary.pendingDebt > 0 && (
            <Card>
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                Registrar Pago
              </h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="primary"
                  onClick={handlePayFull}
                  className="flex-1"
                >
                  Pagar Deuda Completa ({formatCOP(debtSummary.pendingDebt)})
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePayPartial}
                  className="flex-1"
                >
                  Pago Parcial
                </Button>
              </div>
            </Card>
          )}

          {/* Cómo se calcula la deuda */}
          <Card>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Cálculo de la Deuda
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Desglose detallado de cómo se calcula la deuda con Venezuela
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTransactionDetails(!showTransactionDetails)}
              >
                {showTransactionDetails ? 'Ocultar' : 'Ver'} Detalle
              </Button>
            </div>

            {/* Explicación de la fórmula */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">
                📊 Fórmulas aplicadas:
              </h4>
              <div className="text-xs text-blue-800 space-y-1">
                <p>
                  <strong>1. Inversión:</strong> Bolívares × Tasa de Compra
                </p>
                <p>
                  <strong>2. Ganancia del Sistema:</strong> COP Recibido -
                  Inversión
                </p>
                <p>
                  <strong>3. Ganancia Admin Venezuela:</strong> Ganancia del
                  Sistema ÷ 2
                </p>
                <p className="pt-2 border-t border-blue-300 font-bold">
                  <strong>DEUDA = Inversión + Ganancia Admin Venezuela</strong>
                </p>
              </div>
            </div>

            {showTransactionDetails && debtSummary.transactionDetails.length > 0 && (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Fecha
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Beneficiario
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        COP
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Bs
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        T. Venta
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        T. Compra
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Inversión
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Gan. Sistema
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Gan. VE
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase bg-amber-50">
                        Deuda
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {debtSummary.transactionDetails.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                          {formatDate(tx.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-gray-900">
                          {tx.beneficiaryFullName}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">
                          {formatCOP(tx.amountCOP)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">
                          {tx.amountBs.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">
                          {tx.saleRate.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">
                          {tx.purchaseRate.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-blue-600 font-medium">
                          {formatCOP(tx.inversion)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-green-600 font-medium">
                          {formatCOP(tx.gananciaSistema)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-purple-600 font-medium">
                          {formatCOP(tx.gananciaAdminVenezuela)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-amber-700 font-bold bg-amber-50">
                          {formatCOP(tx.deudaConVenezuela)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-sm font-bold text-gray-900">
                        TOTAL
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-blue-600">
                        {formatCOP(
                          debtSummary.transactionDetails.reduce(
                            (sum, tx) => sum + tx.inversion,
                            0
                          )
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-green-600">
                        {formatCOP(
                          debtSummary.transactionDetails.reduce(
                            (sum, tx) => sum + tx.gananciaSistema,
                            0
                          )
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-purple-600">
                        {formatCOP(
                          debtSummary.transactionDetails.reduce(
                            (sum, tx) => sum + tx.gananciaAdminVenezuela,
                            0
                          )
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-amber-700 bg-amber-100">
                        {formatCOP(debtSummary.totalDebt)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {!showTransactionDetails && (
              <p className="text-center text-sm text-gray-500 py-4">
                Click en "Ver Detalle" para ver el desglose completo por
                transacción
              </p>
            )}
          </Card>

          {/* Historial de pagos */}
          {debtSummary.payments.length > 0 && (
            <Card>
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                Historial de Pagos
              </h3>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Fecha Pago
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Monto
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Notas
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Registrado por
                      </th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                        Comprobante
                      </th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {debtSummary.payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900">
                          {formatDate(payment.paymentDate)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-right text-green-600 font-semibold">
                          {formatCOP(payment.amount)}
                        </td>
                        <td className="px-4 py-2 text-gray-600">
                          {payment.notes || '-'}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                          {payment.createdBy}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {payment.proofUrl ? (
                            <a
                              href={payment.proofUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center justify-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Ver
                            </a>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() =>
                              handleDeletePayment(payment.id, payment.amount)
                            }
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Modal de pago */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Registrar Pago a Venezuela"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Monto (COP) *
            </label>
            <input
              type="number"
              value={paymentForm.amount}
              onChange={(e) =>
                setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              min="0"
              step="1"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
              placeholder="Ej: 1000000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha del Pago *
            </label>
            <input
              type="date"
              value={paymentForm.paymentDate}
              onChange={(e) =>
                setPaymentForm((prev) => ({
                  ...prev,
                  paymentDate: e.target.value,
                }))
              }
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notas / Referencia
            </label>
            <textarea
              value={paymentForm.notes}
              onChange={(e) =>
                setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none resize-none"
              placeholder="Ej: Transferencia Bancolombia, referencia #12345"
            />
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
            <Button
              variant="outline"
              onClick={() => setIsPaymentModalOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmitPayment}
              disabled={submitting || !paymentForm.amount}
              className="flex-1"
            >
              {submitting ? 'Registrando...' : 'Registrar Pago'}
            </Button>
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

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title="Confirmar acción"
        message={confirmState.message}
        confirmText="Confirmar"
        cancelText="Cancelar"
        variant="warning"
        onConfirm={confirmState.onConfirm}
        onCancel={() =>
          setConfirmState({ isOpen: false, message: '', onConfirm: () => {} })
        }
      />
    </div>
  );
}

