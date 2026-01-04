'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Alert from '@/components/ui/Alert';
import { clientsService } from '@/services/clients.service';
import { beneficiariesService } from '@/services/beneficiaries.service';
import { transactionsService } from '@/services/transactions.service';
import { ratesService } from '@/services/rates.service';
import { Client } from '@/types/client';
import { Beneficiary } from '@/types/beneficiary';
import { ExchangeRate } from '@/types/rate';

export default function NewTransactionPage() {
    const router = useRouter();
    const { user } = useAuth();
    const isVendorVenezuela = user?.role === 'vendedor' && user?.adminId === 2;
    const [clients, setClients] = useState<Client[]>([]);
    const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
    const [filteredBeneficiaries, setFilteredBeneficiaries] = useState<Beneficiary[]>([]);
    const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Custom rate states
    const [useCustomRate, setUseCustomRate] = useState(false);
    const [customRate, setCustomRate] = useState('');
    const [isCustomRateModalOpen, setIsCustomRateModalOpen] = useState(false);
    const [customRateConfirmed, setCustomRateConfirmed] = useState(false);
    const [alertState, setAlertState] = useState<{ isOpen: boolean; message: string; variant?: 'error' | 'success' | 'warning' | 'info' }>({
        isOpen: false,
        message: '',
        variant: 'info'
    });

    const [formData, setFormData] = useState({
        clientPresencialId: '',
        beneficiaryId: '',
        amountCOP: '',
        amountBs: '',
        notes: '',
        confirmedReceipt: false,
    });

    // Payment proof for Venezuela vendors
    const [paymentProof, setPaymentProof] = useState<File | null>(null);
    const [paymentProofPreview, setPaymentProofPreview] = useState<string>('');

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [clientSearch, setClientSearch] = useState('');
    const [beneficiarySearch, setBeneficiarySearch] = useState('');
    const [currentStep, setCurrentStep] = useState(1);

    useEffect(() => {
        // Importante: aquí solo cargamos la tasa una vez.
        // De esta forma, la tasa que se usa durante la creación de la transferencia
        // se mantiene fija aunque cambie en el sistema mientras el formulario está abierto.
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [clientsData, beneficiariesData, rate] = await Promise.all([
                clientsService.getClients(),
                beneficiariesService.getBeneficiaries(),
                ratesService.getCurrentRate(),
            ]);
            setClients(clientsData);
            setBeneficiaries(beneficiariesData);
            setFilteredBeneficiaries(beneficiariesData);
            setCurrentRate(rate);
            console.log('Current rate loaded:', rate); // Debug log
        } catch (error) {
            console.error('Error loading data:', error);
            setAlertState({
                isOpen: true,
                message: 'Error al cargar los datos. Por favor, recarga la página.',
                variant: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleClientChange = (clientId: string) => {
        setFormData({ ...formData, clientPresencialId: clientId, beneficiaryId: '' });

        if (clientId) {
            const filtered = beneficiaries.filter(b => b.clientColombia?.id === Number(clientId));
            setFilteredBeneficiaries(filtered);
        } else {
            setFilteredBeneficiaries(beneficiaries);
        }
    };

    const formatCOP = (value: number) => {
        return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
    };

    const getActiveRate = (): number => {
        if (useCustomRate && customRate) {
            const parsed = parseFloat(customRate);
            return isNaN(parsed) ? 0 : parsed;
        }
        if (currentRate) {
            // Handle both number and string types
            const rate = typeof currentRate.saleRate === 'number'
                ? currentRate.saleRate
                : parseFloat(String(currentRate.saleRate));
            return isNaN(rate) ? 0 : rate;
        }
        return 0;
    };

    const handleAmountCOPChange = (value: string) => {
        const rawValue = value.replace(/\./g, '');

        if (rawValue === '' || /^\d+$/.test(rawValue)) {
            if (rawValue === '') {
                setFormData({ ...formData, amountCOP: '', amountBs: '' });
                return;
            }

            const cop = parseFloat(rawValue);
            const formattedCOP = formatCOP(cop);
            const activeRate = getActiveRate();

            console.log('Calculating conversion - COP:', cop, 'Rate:', activeRate, 'CurrentRate:', currentRate); // Debug log

            if (activeRate > 0) {
                const bs = cop / activeRate;
                setFormData(prev => ({ ...prev, amountCOP: formattedCOP, amountBs: Math.round(bs).toString() }));
            } else {
                setFormData(prev => ({ ...prev, amountCOP: formattedCOP }));
                console.warn('Active rate is 0 or invalid. Cannot calculate Bs amount.'); // Debug log
            }
        }
    };

    const handleAmountBsChange = (value: string) => {
        setFormData({ ...formData, amountBs: value, amountCOP: '' });
        const activeRate = getActiveRate();

        if (value && activeRate > 0 && !isNaN(Number(value))) {
            const bs = parseFloat(value);
            const cop = bs * activeRate;
            setFormData(prev => ({ ...prev, amountBs: value, amountCOP: formatCOP(cop) }));
        }
    };

    const handleOpenCustomRateModal = () => {
        if (currentRate) {
            const rateValue = typeof currentRate.saleRate === 'number'
                ? currentRate.saleRate
                : parseFloat(String(currentRate.saleRate));
            setCustomRate(rateValue.toFixed(2));
        } else {
            setCustomRate('');
        }
        setCustomRateConfirmed(false);
        setIsCustomRateModalOpen(true);
    };

    const handleApplyCustomRate = () => {
        if (!customRate || parseFloat(customRate) <= 0) {
            setAlertState({
                isOpen: true,
                message: 'Por favor ingresa una tasa válida',
                variant: 'error'
            });
            return;
        }

        if (!customRateConfirmed) {
            setAlertState({
                isOpen: true,
                message: 'Debes confirmar que consultaste esta tasa con el administrador',
                variant: 'warning'
            });
            return;
        }

        setUseCustomRate(true);
        setIsCustomRateModalOpen(false);

        // Recalcular montos con la nueva tasa
        if (formData.amountCOP) {
            const cop = parseFloat(formData.amountCOP.replace(/\./g, ''));
            const bs = cop / parseFloat(customRate);
            setFormData(prev => ({ ...prev, amountBs: Math.round(bs).toString() }));
        } else if (formData.amountBs) {
            const bs = parseFloat(formData.amountBs);
            const cop = bs * parseFloat(customRate);
            setFormData(prev => ({ ...prev, amountCOP: formatCOP(cop) }));
        }
    };

    const handleResetToOfficialRate = () => {
        setUseCustomRate(false);
        setCustomRate('');
        setCustomRateConfirmed(false);

        // Recalcular montos con la tasa oficial
        if (formData.amountCOP && currentRate) {
            const cop = parseFloat(formData.amountCOP.replace(/\./g, ''));
            const bs = cop / Number(currentRate.saleRate);
            setFormData(prev => ({ ...prev, amountBs: Math.round(bs).toString() }));
        } else if (formData.amountBs && currentRate) {
            const bs = parseFloat(formData.amountBs);
            const cop = bs * Number(currentRate.saleRate);
            setFormData(prev => ({ ...prev, amountCOP: formatCOP(cop) }));
        }
    };

    const handlePaymentProofChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPaymentProof(file);
            setPaymentProofPreview(URL.createObjectURL(file));
        }
    };

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.clientPresencialId) {
            newErrors.clientPresencialId = 'Selecciona un cliente';
        }

        if (!formData.beneficiaryId) {
            newErrors.beneficiaryId = 'Selecciona un destinatario';
        }

        if (!formData.amountCOP && !formData.amountBs) {
            newErrors.amount = 'Ingresa un monto en COP o Bs';
        }

        // Validación diferente según tipo de vendedor
        if (isVendorVenezuela) {
            if (!paymentProof) {
                newErrors.paymentProof = 'Debes adjuntar el comprobante de pago';
            }
        } else {
            if (!formData.confirmedReceipt) {
                newErrors.confirmedReceipt = 'Debes confirmar que recibiste el dinero';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const validateStep1 = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.clientPresencialId) {
            newErrors.clientPresencialId = 'Selecciona un cliente';
        }

        if (!formData.beneficiaryId) {
            newErrors.beneficiaryId = 'Selecciona un destinatario';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNextStep = () => {
        if (validateStep1()) {
            setCurrentStep(2);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handlePreviousStep = () => {
        setCurrentStep(1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        setSaving(true);
        try {
            // Si es vendedor de Venezuela, usar FormData para incluir el archivo
            if (isVendorVenezuela && paymentProof) {
                const formDataToSend = new FormData();
                formDataToSend.append('beneficiaryId', formData.beneficiaryId);
                formDataToSend.append('clientPresencialId', formData.clientPresencialId);
                if (formData.amountCOP) {
                    formDataToSend.append('amountCOP', parseFloat(formData.amountCOP.replace(/\./g, '')).toString());
                }
                if (formData.amountBs) {
                    formDataToSend.append('amountBs', formData.amountBs);
                }
                if (formData.notes) {
                    formDataToSend.append('notes', formData.notes);
                }
                if (useCustomRate && customRate) {
                    formDataToSend.append('customRate', customRate);
                }
                formDataToSend.append('paymentProof', paymentProof);

                await transactionsService.createTransactionWithProof(formDataToSend);
            } else {
                // Vendedor de Colombia - método tradicional
                const transactionData: any = {
                    beneficiaryId: Number(formData.beneficiaryId),
                    clientPresencialId: Number(formData.clientPresencialId),
                    amountCOP: formData.amountCOP ? parseFloat(formData.amountCOP.replace(/\./g, '')) : undefined,
                    amountBs: formData.amountBs ? parseFloat(formData.amountBs) : undefined,
                    notes: formData.notes || undefined,
                };

                // Si se está usando una tasa personalizada, incluirla en la transacción
                if (useCustomRate && customRate) {
                    transactionData.customRate = parseFloat(customRate);
                }

                await transactionsService.createTransaction(transactionData);
            }

            router.push('/dashboard/transactions');
        } catch (error: any) {
            console.error('Error creating transaction:', error);
            setErrors({
                general: error.response?.data?.message || 'Error al crear la transacción',
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="p-4 sm:p-8 flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600"></div>
            </div>
        );
    }

    // Filter clients: show top 3 if no search, otherwise search all
    // Always include the selected client if one is selected
    const selectedClient = formData.clientPresencialId 
        ? clients.find(c => c.id.toString() === formData.clientPresencialId)
        : null;
    
    let baseFilteredClients = clientSearch.trim() === ''
        ? clients.slice(0, 3)
        : clients.filter(client =>
            client.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
            client.phone.includes(clientSearch) ||
            (client.documentId && client.documentId.includes(clientSearch))
        );
    
    // Always include the selected client at the beginning if it exists and isn't already in the list
    const filteredClients = selectedClient && !baseFilteredClients.some(c => c.id === selectedClient.id)
        ? [selectedClient, ...baseFilteredClients]
        : baseFilteredClients;

    // Filter beneficiaries: show top 3 if no search, otherwise search all
    const searchedBeneficiaries = beneficiarySearch.trim() === ''
        ? filteredBeneficiaries.slice(0, 3)
        : filteredBeneficiaries.filter(ben =>
            ben.fullName.toLowerCase().includes(beneficiarySearch.toLowerCase()) ||
            ben.accountNumber?.includes(beneficiarySearch) ||
            ben.bankName.toLowerCase().includes(beneficiarySearch.toLowerCase()) ||
            ben.phone?.includes(beneficiarySearch) ||
            ben.documentId.includes(beneficiarySearch)
        );

    // Get selected beneficiary for preview
    const selectedBen = beneficiaries.find(b => b.id.toString() === formData.beneficiaryId);


    return (
        <div className="p-4 sm:p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    Nueva Transacción
                </h1>
                <p className="text-gray-600">
                    Crea un nuevo giro a Venezuela
                </p>
            </div>

            <div className="max-w-4xl mx-auto">
                {/* Step Indicator */}
                <div className="mb-6 sm:mb-8">
                    <div className="flex items-center justify-center px-2">
                        <div className="flex items-center w-full max-w-2xl">
                            {/* Step 1 */}
                            <div className="flex items-center flex-1">
                                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold transition-all text-sm sm:text-base flex-shrink-0 ${currentStep >= 1
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-600'
                                    }`}>
                                    1
                                </div>
                                <div className="ml-2 sm:ml-3 text-left hidden sm:block">
                                    <p className={`text-xs sm:text-sm font-medium ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-500'}`}>
                                        Paso 1
                                    </p>
                                    <p className="text-xs text-gray-500 hidden md:block">Cliente y Destinatario</p>
                                </div>
                            </div>

                            {/* Divider */}
                            <div className={`h-0.5 sm:h-1 flex-1 mx-2 sm:mx-4 transition-all ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'
                                }`}></div>

                            {/* Step 2 */}
                            <div className="flex items-center flex-1 justify-end">
                                <div className="mr-2 sm:mr-3 text-right hidden sm:block">
                                    <p className={`text-xs sm:text-sm font-medium ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-500'}`}>
                                        Paso 2
                                    </p>
                                    <p className="text-xs text-gray-500 hidden md:block">Monto y Confirmación</p>
                                </div>
                                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold transition-all text-sm sm:text-base flex-shrink-0 ${currentStep >= 2
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-600'
                                    }`}>
                                    2
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Mobile step description */}
                    <div className="text-center mt-3 sm:hidden">
                        <p className={`text-xs font-medium ${currentStep === 1 ? 'text-blue-600' : 'text-gray-500'}`}>
                            {currentStep === 1 ? 'Paso 1: Cliente y Destinatario' : 'Paso 2: Monto y Confirmación'}
                        </p>
                    </div>
                </div>

                {/* Exchange Rate Banner */}
                {currentRate && (
                    <div className="mb-6">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-6 shadow-lg">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-blue-100 text-sm mb-1">Tasa de cambio actual</p>
                                    <p className="text-3xl font-bold">
                                        {parseFloat(currentRate.saleRate.toString()).toFixed(2)} COP/Bs
                                    </p>
                                    <p className="text-blue-100 text-xs mt-2">
                                        Actualizada: {new Date(currentRate.createdAt).toLocaleString('es-CO')}
                                    </p>
                                </div>
                                <svg className="w-16 h-16 opacity-50" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                                </svg>
                            </div>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    {/* Step 1: Client and Beneficiary Selection */}
                    {currentStep === 1 && (
                        <Card className="mb-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-6">Información del Cliente</h2>

                            {errors.general && (
                                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                    {errors.general}
                                </div>
                            )}

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-3">
                                        Cliente *
                                    </label>

                                    {/* Search bar for clients */}
                                    <div className="mb-3">
                                        <input
                                            type="text"
                                            placeholder="Buscar cliente por nombre o teléfono..."
                                            value={clientSearch}
                                            onChange={(e) => setClientSearch(e.target.value)}
                                            className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                                        />
                                    </div>

                                    {/* Scrollable container for clients */}
                                    <div className="max-h-[400px] overflow-y-auto border-2 border-gray-200 rounded-xl p-3">
                                        {filteredClients.length === 0 ? (
                                            <div className="p-6 text-center text-gray-500">
                                                No se encontraron clientes
                                            </div>
                                        ) : (
                                            <>
                                                <div className="mb-2 text-xs text-gray-500 px-1 font-medium italic">
                                                    {clientSearch.trim() === ''
                                                        ? (selectedClient && !clients.slice(0, 3).some(c => c.id === selectedClient.id)
                                                            ? 'Cliente seleccionado + últimos 3 clientes creados. Usa el buscador para ver otros.'
                                                            : 'Mostrando los últimos 3 clientes creados. Usa el buscador para ver otros.')
                                                        : `Resultados de búsqueda: ${filteredClients.length} cliente(s)`}
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {filteredClients.map(client => (
                                                        <button
                                                            key={client.id}
                                                            type="button"
                                                            onClick={() => {
                                                                handleClientChange(client.id.toString());
                                                                setClientSearch('');
                                                            }}
                                                            className={`p-4 rounded-xl border-2 transition-all text-left ${formData.clientPresencialId === client.id.toString()
                                                                ? 'border-blue-500 bg-blue-50 shadow-md'
                                                                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                                                                }`}
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${formData.clientPresencialId === client.id.toString()
                                                                    ? 'bg-blue-500 text-white'
                                                                    : 'bg-gray-200 text-gray-600'
                                                                    }`}>
                                                                    {client.name.charAt(0).toUpperCase()}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="font-semibold text-gray-900 truncate">{client.name}</p>
                                                                    <p className="text-sm text-gray-500 truncate">{client.phone}</p>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    {errors.clientPresencialId && (
                                        <p className="mt-2 text-sm text-red-600">{errors.clientPresencialId}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-3">
                                        Destinatario *
                                    </label>
                                    {!formData.clientPresencialId ? (
                                        <div className="p-6 border-2 border-dashed border-gray-300 rounded-xl text-center text-gray-500">
                                            Primero selecciona un cliente
                                        </div>
                                    ) : filteredBeneficiaries.length === 0 ? (
                                        <div className="p-6 border-2 border-dashed border-yellow-300 bg-yellow-50 rounded-xl text-center text-yellow-700">
                                            Este cliente no tiene destinatarios asociados
                                        </div>
                                    ) : (
                                        <>
                                            {/* Search bar for beneficiaries */}
                                            <div className="mb-3">
                                                <input
                                                    type="text"
                                                    placeholder="Buscar destinatario por nombre, banco o cuenta..."
                                                    value={beneficiarySearch}
                                                    onChange={(e) => setBeneficiarySearch(e.target.value)}
                                                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                                                />
                                            </div>

                                            {/* Scrollable container for beneficiaries */}
                                            <div className="max-h-[400px] overflow-y-auto border-2 border-gray-200 rounded-xl p-3">
                                                {searchedBeneficiaries.length === 0 ? (
                                                    <div className="p-6 text-center text-gray-500">
                                                        No se encontraron destinatarios
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="mb-2 text-xs text-gray-500 px-1 font-medium italic">
                                                            {beneficiarySearch.trim() === ''
                                                                ? 'Mostrando los últimos 3 destinatarios. Usa el buscador para ver otros.'
                                                                : `Resultados de búsqueda: ${searchedBeneficiaries.length} destinatario(s)`}
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-3">
                                                            {searchedBeneficiaries.map(ben => (
                                                                <button
                                                                    key={ben.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setFormData({ ...formData, beneficiaryId: ben.id.toString() });
                                                                        setBeneficiarySearch('');
                                                                    }}
                                                                    className={`p-4 rounded-xl border-2 transition-all text-left ${formData.beneficiaryId === ben.id.toString()
                                                                        ? 'border-blue-500 bg-blue-50 shadow-md'
                                                                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                                                                        }`}
                                                                >
                                                                    <div className="flex items-start gap-3">
                                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${formData.beneficiaryId === ben.id.toString()
                                                                            ? 'bg-blue-500 text-white'
                                                                            : 'bg-gray-200 text-gray-600'
                                                                            }`}>
                                                                            {ben.fullName.charAt(0).toUpperCase()}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="font-semibold text-gray-900">{ben.fullName}</p>
                                                                            <p className="text-sm text-gray-600">{ben.bankName}</p>
                                                                            <p className="text-sm text-gray-500">{ben.accountType} - {ben.accountNumber}</p>
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </>
                                    )}
                                    {errors.beneficiaryId && (
                                        <p className="mt-2 text-sm text-red-600">{errors.beneficiaryId}</p>
                                    )}
                                </div>

                                {/* Vista Previa Destinatario Seleccionado */}
                                {selectedBen && (
                                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-5 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-blue-900 font-bold flex items-center gap-2">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Verificación de Seguridad
                                            </h3>
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${selectedBen.isPagoMovil ? 'bg-blue-200 text-blue-800' : 'bg-indigo-200 text-indigo-800'}`}>
                                                {selectedBen.isPagoMovil ? '📱 Pago Móvil' : '🏦 Transferencia'}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
                                            <div>
                                                <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mb-0.5">Nombre del Destinatario</p>
                                                <p className="text-gray-900 font-bold text-lg leading-tight">{selectedBen.fullName}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mb-0.5">Cédula / Rif</p>
                                                <p className="text-gray-900 font-bold">{selectedBen.documentId}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mb-0.5">Banco de Destino</p>
                                                <p className="text-gray-900 font-bold">{selectedBen.bankName}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mb-0.5">
                                                    {selectedBen.isPagoMovil ? 'Teléfono Asociado' : 'Número de Cuenta'}
                                                </p>
                                                <p className="text-gray-900 font-mono font-bold tracking-wider">
                                                    {selectedBen.isPagoMovil ? selectedBen.phone : selectedBen.accountNumber}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Step 1 Navigation */}
                            <div className="flex gap-4 mt-8">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => router.back()}
                                    className="flex-1"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleNextStep}
                                    className="flex-1"
                                >
                                    Siguiente
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* Step 2: Amount, Notes, and Confirmation */}
                    {currentStep === 2 && (
                        <>
                            <Card className="mb-6">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                                    <h2 className="text-xl font-bold text-gray-900">Monto de la Transacción</h2>
                                    {!useCustomRate ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={handleOpenCustomRateModal}
                                            className="w-full sm:w-auto"
                                        >
                                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            Utilizar tasa diferente
                                        </Button>
                                    ) : (
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <span className="text-sm text-green-600 font-medium px-3 py-2 bg-green-50 rounded-lg">
                                                ✓ Usando tasa personalizada: {parseFloat(customRate).toFixed(2)}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleResetToOfficialRate}
                                            >
                                                Volver a tasa oficial
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <Input
                                            label="Monto en COP"
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="0.00"
                                            value={formData.amountCOP}
                                            onChange={(e) => handleAmountCOPChange(e.target.value)}
                                            error={errors.amount}
                                            icon={
                                                <span className="text-gray-500 font-medium">$</span>
                                            }
                                        />
                                    </div>

                                    <div>
                                        <Input
                                            label="Monto en Bs"
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="0"
                                            value={formData.amountBs}
                                            onChange={(e) => handleAmountBsChange(e.target.value.replace(/\D/g, ''))}
                                            error={errors.amount}
                                            icon={
                                                <span className="text-gray-500 font-medium">Bs</span>
                                            }
                                        />
                                    </div>
                                </div>

                                {formData.amountCOP && formData.amountBs && (
                                    <div className={`mt-4 p-4 border rounded-lg ${useCustomRate ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                                        <p className={`text-sm ${useCustomRate ? 'text-green-900' : 'text-blue-900'}`}>
                                            <span className="font-semibold">Conversión:</span> ${formData.amountCOP} COP = {parseInt(formData.amountBs).toLocaleString('es-CO')} Bs
                                            <span className={`ml-2 ${useCustomRate ? 'text-green-700' : 'text-blue-700'}`}>
                                                (Tasa {useCustomRate ? 'personalizada' : 'oficial'}: {Number(getActiveRate()).toFixed(2)})
                                            </span>
                                        </p>
                                        {useCustomRate && (
                                            <p className="text-xs text-green-700 mt-1">
                                                ⚠️ Esta transacción usará una tasa personalizada consultada con el administrador
                                            </p>
                                        )}
                                    </div>
                                )}
                            </Card>

                            <Card className="mb-6">
                                <h2 className="text-xl font-bold text-gray-900 mb-6">Notas (Opcional)</h2>

                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="Agrega notas o comentarios sobre esta transacción..."
                                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none resize-none"
                                    rows={4}
                                />
                            </Card>

                            {/* Confirmation Checkbox OR Payment Proof Upload */}
                            <Card className="mb-6">
                                {isVendorVenezuela ? (
                                    // Para vendedores de Venezuela: subir comprobante
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900 mb-4">Comprobante de Pago *</h2>
                                        <div className={`p-4 rounded-xl border-2 transition-all ${errors.paymentProof ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                                            <p className="text-sm text-gray-600 mb-4">
                                                Adjunta el comprobante de pago que recibiste del cliente. Este será visible para el administrador de Venezuela.
                                            </p>
                                            
                                            <input
                                                type="file"
                                                accept="image/*,.pdf"
                                                onChange={handlePaymentProofChange}
                                                className="hidden"
                                                id="paymentProofInput"
                                            />
                                            
                                            {!paymentProof ? (
                                                <label
                                                    htmlFor="paymentProofInput"
                                                    className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all"
                                                >
                                                    <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                    </svg>
                                                    <p className="text-sm font-medium text-gray-700">Haz clic para seleccionar el comprobante</p>
                                                    <p className="text-xs text-gray-500 mt-1">PNG, JPG o PDF (máx. 5MB)</p>
                                                </label>
                                            ) : (
                                                <div className="space-y-3">
                                                    {paymentProofPreview && (
                                                        <div className="relative">
                                                            <img
                                                                src={paymentProofPreview}
                                                                alt="Vista previa"
                                                                className="w-full max-h-64 object-contain rounded-lg border-2 border-gray-200"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                                                        <div className="flex items-center gap-2">
                                                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            <span className="text-sm font-medium text-green-900">{paymentProof.name}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setPaymentProof(null);
                                                                setPaymentProofPreview('');
                                                            }}
                                                            className="text-red-600 hover:text-red-700 text-sm font-medium"
                                                        >
                                                            Eliminar
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {errors.paymentProof && (
                                                <p className="mt-2 text-sm text-red-600">{errors.paymentProof}</p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    // Para vendedores de Colombia: checkbox de confirmación
                                    <div className={`p-4 rounded-xl border-2 transition-all ${errors.confirmedReceipt ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.confirmedReceipt}
                                                onChange={(e) => setFormData({ ...formData, confirmedReceipt: e.target.checked })}
                                                className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                            />
                                            <div className="flex-1">
                                                <p className="font-semibold text-gray-900">
                                                    Confirmo haber recibido el dinero de esta transacción
                                                </p>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    Al marcar esta casilla, confirmas que has recibido el pago del cliente y te comprometes a consignarlo posteriormente.
                                                </p>
                                            </div>
                                        </label>
                                        {errors.confirmedReceipt && (
                                            <p className="mt-2 text-sm text-red-600 ml-8">{errors.confirmedReceipt}</p>
                                        )}
                                    </div>
                                )}
                            </Card>

                            {/* Step 2 Navigation */}
                            <div className="flex gap-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handlePreviousStep}
                                    className="flex-1"
                                >
                                    Anterior
                                </Button>
                                <Button
                                    type="submit"
                                    isLoading={saving}
                                    className="flex-1"
                                >
                                    Crear Transacción
                                </Button>
                            </div>
                        </>
                    )}
                </form>
            </div>

            {/* Custom Rate Modal */}
            <Modal
                isOpen={isCustomRateModalOpen}
                onClose={() => setIsCustomRateModalOpen(false)}
                title="Utilizar Tasa Personalizada"
                size="md"
            >
                <div className="space-y-4">
                    <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                        <div className="flex gap-3">
                            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                                <p className="text-sm font-medium text-yellow-900">Importante</p>
                                <p className="text-xs text-yellow-800 mt-1">
                                    Solo usa una tasa personalizada si el administrador la ha autorizado previamente.
                                    Esta tasa se aplicará a esta transacción específica.
                                </p>
                            </div>
                        </div>
                    </div>

                    {isVendorVenezuela && (
                        <div className="p-4 bg-purple-50 border-2 border-purple-300 rounded-xl">
                            <div className="flex gap-3">
                                <svg className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div>
                                    <p className="text-sm font-bold text-purple-900">⚠️ Aviso Importante</p>
                                    <p className="text-xs text-purple-800 mt-1">
                                        <strong>Ojo:</strong> Al usar una tasa personalizada, tu comisión de este giro bajará del 5% al 4%.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentRate && (
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">
                                Tasa oficial actual: <span className="font-bold text-gray-900">{parseFloat(currentRate.saleRate.toString()).toFixed(2)} Bs/COP</span>
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Tasa Personalizada (Bs/COP) *
                        </label>
                        <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            value={customRate}
                            onChange={(e) => setCustomRate(e.target.value)}
                            placeholder="0.00"
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none text-lg font-semibold"
                        />
                        <p className="mt-2 text-xs text-gray-500">
                            Ingresa la tasa con hasta 2 decimales (ej: 0.02)
                        </p>
                    </div>

                    <div className="p-4 border-2 border-blue-200 rounded-xl bg-blue-50">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={customRateConfirmed}
                                onChange={(e) => setCustomRateConfirmed(e.target.checked)}
                                className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                            />
                            <div className="flex-1">
                                <p className="font-semibold text-blue-900 text-sm">
                                    Confirmo haber consultado previamente esta tasa personalizada con el administrador
                                </p>
                                <p className="text-xs text-blue-700 mt-1">
                                    Esta confirmación es obligatoria para aplicar una tasa diferente a la oficial
                                </p>
                            </div>
                        </label>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsCustomRateModalOpen(false)}
                            className="flex-1"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            onClick={handleApplyCustomRate}
                            className="flex-1"
                        >
                            Aplicar Tasa
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
        </div>
    );
}
