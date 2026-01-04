'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Alert from '@/components/ui/Alert';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { transactionsService } from '@/services/transactions.service';
import { beneficiariesService } from '@/services/beneficiaries.service';
import { Transaction } from '@/types/transaction';
import { Beneficiary } from '@/types/beneficiary';
import { useAuth } from '@/hooks/useAuth';
import Modal from '@/components/ui/Modal';

export default function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { user } = useAuth();
    const { id } = use(params);
    const isVendorVenezuela = user?.role === 'vendedor' && user?.adminId === 2;
    const [transaction, setTransaction] = useState<Transaction | null>(null);
    const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
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

    // Estados para editar comprobante
    const [isEditProofModalOpen, setIsEditProofModalOpen] = useState(false);
    const [newProof, setNewProof] = useState<File | null>(null);
    const [newProofPreview, setNewProofPreview] = useState<string>('');
    const [updatingProof, setUpdatingProof] = useState(false);

    const [formData, setFormData] = useState({
        amountCOP: '',
        amountBs: '',
        beneficiaryId: '',
        notes: '',
    });

    const [beneficiaryData, setBeneficiaryData] = useState({
        fullName: '',
        documentId: '',
        bankName: '',
        accountNumber: '',
        accountType: '',
        phone: '',
        clientColombiaId: 0,
    });

    const [originalBeneficiaryData, setOriginalBeneficiaryData] = useState({
        fullName: '',
        documentId: '',
        bankName: '',
        accountNumber: '',
        accountType: '',
        phone: '',
        clientColombiaId: 0,
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            // Pausar el cronómetro al entrar al modo de edición
            await transactionsService.enterEditMode(parseInt(id));

            const [transactionData, beneficiariesData] = await Promise.all([
                transactionsService.getTransaction(parseInt(id)),
                beneficiariesService.getBeneficiaries(),
            ]);

            const now = new Date();
            const lastEdited = new Date(transactionData.lastEditedAt || transactionData.createdAt);
            const diffMinutes = (now.getTime() - lastEdited.getTime()) / (1000 * 60);

            if (transactionData.status !== 'pendiente' || diffMinutes >= 5) {
                setAlertState({
                    isOpen: true,
                    message: 'Esta transacción ya no puede ser editada',
                    variant: 'warning'
                });
                setTimeout(() => {
                    router.push('/dashboard/transactions');
                }, 2000);
                return;
            }

            setTransaction(transactionData);
            setBeneficiaries(beneficiariesData);

            setFormData({
                amountCOP: new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(transactionData.amountCOP),
                amountBs: transactionData.amountBs.toString(),
                beneficiaryId: transactionData.beneficiary?.id?.toString() || '',
                notes: transactionData.notes || '',
            });

            const beneficiary = transactionData.beneficiary as any;
            const beneficiaryFormData = {
                fullName: beneficiary?.fullName || '',
                documentId: beneficiary?.documentId || '',
                bankName: beneficiary?.bankName || '',
                accountNumber: beneficiary?.accountNumber || '',
                accountType: beneficiary?.accountType || '',
                phone: beneficiary?.phone || '',
                clientColombiaId: beneficiary?.clientColombia?.id || 0,
            };
            setBeneficiaryData(beneficiaryFormData);
            setOriginalBeneficiaryData(beneficiaryFormData);
        } catch (error) {
            console.error('Error loading data:', error);
            setError('Error al cargar la transacción');
        } finally {
            setLoading(false);
        }
    };

    const handleBeneficiaryChange = (beneficiaryId: string) => {
        setFormData({ ...formData, beneficiaryId });

        if (!beneficiaryId) {
            setBeneficiaryData({
                fullName: '',
                documentId: '',
                bankName: '',
                accountNumber: '',
                accountType: '',
                phone: '',
                clientColombiaId: 0,
            });
            return;
        }

        const beneficiary = beneficiaries.find(b => b.id === parseInt(beneficiaryId));
        if (beneficiary) {
            const newBeneficiaryData = {
                fullName: beneficiary.fullName || '',
                documentId: beneficiary.documentId || '',
                bankName: beneficiary.bankName || '',
                accountNumber: beneficiary.accountNumber || '',
                accountType: beneficiary.accountType || '',
                phone: beneficiary.phone || '',
                clientColombiaId: beneficiary.clientColombia?.id || 0,
            };
            setBeneficiaryData(newBeneficiaryData);
            setOriginalBeneficiaryData(newBeneficiaryData);
        }
    };

    const formatCOP = (value: number) => {
        return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (!transaction) return;

        const rate = Number(transaction.saleRate || transaction.rateUsed || 0);

        if (isNaN(rate) || rate === 0) {
            console.error('Tasa inválida:', rate);
            return;
        }

        if (name === 'amountCOP') {
            const rawValue = value.replace(/\./g, '');

            if (rawValue === '' || /^\d+$/.test(rawValue)) {
                if (rawValue === '') {
                    setFormData(prev => ({ ...prev, amountCOP: '', amountBs: '' }));
                    return;
                }

                const cop = parseFloat(rawValue);
                const bs = cop / rate;
                setFormData(prev => ({
                    ...prev,
                    amountCOP: formatCOP(cop),
                    amountBs: bs.toFixed(2)
                }));
            }
        } else {
            const bs = parseFloat(value) || 0;
            const cop = bs * rate;
            setFormData(prev => ({
                ...prev,
                amountBs: value,
                amountCOP: formatCOP(cop)
            }));
        }
    };

    const hasBeneficiaryChanges = (): boolean => {
        return Object.keys(beneficiaryData).some(
            key => beneficiaryData[key as keyof typeof beneficiaryData] !==
                originalBeneficiaryData[key as keyof typeof originalBeneficiaryData]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        try {
            if (hasBeneficiaryChanges()) {
                setConfirmState({
                    isOpen: true,
                    message: 'Se detectaron cambios en los datos del destinatario. ¿Desea guardar estos cambios?',
                    onConfirm: async () => {
                        await beneficiariesService.updateBeneficiary(
                            parseInt(formData.beneficiaryId),
                            {
                                fullName: beneficiaryData.fullName,
                                documentId: beneficiaryData.documentId,
                                bankName: beneficiaryData.bankName,
                                accountNumber: beneficiaryData.accountNumber,
                                accountType: beneficiaryData.accountType as 'ahorro' | 'corriente',
                                phone: beneficiaryData.phone,
                                clientColombiaId: beneficiaryData.clientColombiaId,
                            }
                        );
                        await transactionsService.updateTransaction(parseInt(id), {
                            amountCOP: parseFloat(formData.amountCOP.replace(/\./g, '')),
                            beneficiaryId: parseInt(formData.beneficiaryId),
                            notes: formData.notes,
                        });
                        setConfirmState({ isOpen: false, message: '', onConfirm: () => { } });
                        router.push('/dashboard/transactions');
                    }
                });
                setSaving(false);
                return;
            }

            await transactionsService.updateTransaction(parseInt(id), {
                amountCOP: parseFloat(formData.amountCOP.replace(/\./g, '')),
                beneficiaryId: parseInt(formData.beneficiaryId),
                notes: formData.notes,
            });

            router.push('/dashboard/transactions');
        } catch (error: any) {
            console.error('Error updating transaction:', error);
            setError(error.response?.data?.message || 'Error al actualizar la transacción');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!transaction) return null;

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Editar Transacción #{transaction.id}</h1>
                <p className="text-gray-600">Modifica los detalles de la transacción y Destinatario</p>
            </div>

            <Card>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                            Destinatario
                        </label>
                        <select
                            value={formData.beneficiaryId}
                            onChange={(e) => handleBeneficiaryChange(e.target.value)}
                            className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-lg border-2 border-gray-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                            required
                        >
                            <option value="">Seleccionar Destinatario</option>
                            {beneficiaries.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.fullName} - {b.bankName}
                                </option>
                            ))}
                        </select>
                    </div>

                    {formData.beneficiaryId && (
                        <div className="border-2 border-blue-100 rounded-xl p-3 sm:p-4 bg-blue-50">
                            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Datos del Destinatario</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                <Input
                                    label="Nombre Completo"
                                    value={beneficiaryData.fullName}
                                    onChange={(e) => setBeneficiaryData({ ...beneficiaryData, fullName: e.target.value })}
                                    required
                                />
                                <Input
                                    label="Documento de Identidad"
                                    value={beneficiaryData.documentId}
                                    onChange={(e) => setBeneficiaryData({ ...beneficiaryData, documentId: e.target.value })}
                                    required
                                />
                                <Input
                                    label="Banco"
                                    value={beneficiaryData.bankName}
                                    onChange={(e) => setBeneficiaryData({ ...beneficiaryData, bankName: e.target.value })}
                                    required
                                />
                                <Input
                                    label="Número de Cuenta"
                                    value={beneficiaryData.accountNumber}
                                    onChange={(e) => setBeneficiaryData({ ...beneficiaryData, accountNumber: e.target.value })}
                                    required
                                />
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                                        Tipo de Cuenta
                                    </label>
                                    <select
                                        value={beneficiaryData.accountType}
                                        onChange={(e) => setBeneficiaryData({ ...beneficiaryData, accountType: e.target.value })}
                                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-lg border-2 border-gray-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                                        required
                                    >
                                        <option value="">Seleccionar</option>
                                        <option value="ahorro">Ahorro</option>
                                        <option value="corriente">Corriente</option>
                                    </select>
                                </div>
                                <Input
                                    label="Teléfono (Opcional)"
                                    value={beneficiaryData.phone}
                                    onChange={(e) => setBeneficiaryData({ ...beneficiaryData, phone: e.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                            label="Monto en Pesos (COP)"
                            name="amountCOP"
                            type="text"
                            value={formData.amountCOP}
                            onChange={handleAmountChange}
                            required
                        />
                        <Input
                            label="Monto en Bolívares (Bs)"
                            name="amountBs"
                            type="number"
                            value={formData.amountBs}
                            onChange={handleAmountChange}
                            required
                        />
                    </div>

                    <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
                        <p className="text-sm text-green-800">
                            Tasa de cambio original: <span className="font-bold">
                                {Number(transaction.saleRate || transaction.rateUsed || 0) > 0
                                    ? Number(transaction.saleRate || transaction.rateUsed).toFixed(4)
                                    : '-'} Bs/COP
                            </span>
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                            Esta es la tasa que se usó al crear la transacción
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                            Notas (Opcional)
                        </label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm rounded-lg border-2 border-gray-300 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                            rows={3}
                        />
                    </div>

                    {/* Sección para editar comprobante (solo para vendedores de Venezuela) */}
                    {isVendorVenezuela && transaction.vendorPaymentProof && (
                        <div className="border-2 border-green-100 rounded-xl p-4 bg-green-50">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Comprobante de Pago</h3>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNewProof(null);
                                        setNewProofPreview('');
                                        setIsEditProofModalOpen(true);
                                    }}
                                    className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                                >
                                    Editar Comprobante
                                </button>
                            </div>
                            <p className="text-xs text-green-700">
                                Comprobante adjuntado al crear la transacción. Puedes editarlo dentro de los primeros 5 minutos.
                            </p>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.push('/dashboard/transactions')}
                            className="w-full sm:w-auto"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            isLoading={saving}
                            className="w-full sm:w-auto"
                        >
                            Guardar Cambios
                        </Button>
                    </div>
                </form>
            </Card>

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
                title="Confirmar cambios"
                message={confirmState.message}
                confirmText="Sí, guardar"
                cancelText="No, cancelar"
                variant="warning"
                onConfirm={confirmState.onConfirm}
                onCancel={() => {
                    setConfirmState({ isOpen: false, message: '', onConfirm: () => { } });
                    setSaving(false);
                }}
            />

            {/* Modal para editar comprobante */}
            <Modal
                isOpen={isEditProofModalOpen}
                onClose={() => setIsEditProofModalOpen(false)}
                title="Editar Comprobante de Pago"
                size="md"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Selecciona un nuevo archivo para reemplazar el comprobante de pago de la transacción #{transaction?.id}.
                    </p>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nuevo Comprobante *
                        </label>
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    setNewProof(file);
                                    if (file.type.startsWith('image/')) {
                                        setNewProofPreview(URL.createObjectURL(file));
                                    } else {
                                        setNewProofPreview('');
                                    }
                                }
                            }}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                        />
                        {newProofPreview && (
                            <div className="mt-3">
                                <img src={newProofPreview} alt="Preview" className="max-h-48 rounded-lg border border-gray-200" />
                            </div>
                        )}
                        {!newProofPreview && newProof && (
                            <p className="mt-2 text-sm text-blue-600 font-medium">Archivo seleccionado: {newProof.name}</p>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                        <Button
                            variant="outline"
                            onClick={() => setIsEditProofModalOpen(false)}
                            className="flex-1"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={async () => {
                                if (!newProof || !transaction) return;
                                setUpdatingProof(true);
                                try {
                                    await transactionsService.updateVendorPaymentProof(transaction.id, newProof);
                                    setAlertState({
                                        isOpen: true,
                                        message: 'Comprobante actualizado exitosamente',
                                        variant: 'success'
                                    });
                                    setIsEditProofModalOpen(false);
                                    setNewProof(null);
                                    setNewProofPreview('');
                                    // Recargar los datos de la transacción
                                    const transactionData = await transactionsService.getTransaction(transaction.id);
                                    setTransaction(transactionData);
                                } catch (error: any) {
                                    setAlertState({
                                        isOpen: true,
                                        message: error.response?.data?.message || 'Error al actualizar el comprobante',
                                        variant: 'error'
                                    });
                                } finally {
                                    setUpdatingProof(false);
                                }
                            }}
                            isLoading={updatingProof}
                            disabled={!newProof}
                            className="flex-1 bg-blue-600 hover:bg-blue-700"
                        >
                            Actualizar
                        </Button>
                    </div>
                </div>
            </Modal>
        </div >
    );
}
