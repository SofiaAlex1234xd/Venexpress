'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import SearchBar from '@/components/ui/SearchBar';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Alert from '@/components/ui/Alert';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { beneficiariesService } from '@/services/beneficiaries.service';
import { clientsService } from '@/services/clients.service';
import { usersService, Vendor } from '@/services/users.service';
import { useAuth } from '@/hooks/useAuth';
import { Beneficiary } from '@/types/beneficiary';
import { Client } from '@/types/client';

const VENEZUELAN_BANKS = [
    { code: '0191', name: 'BNC' },
    { code: '0151', name: 'BFC' },
    { code: '0116', name: 'BOD' },
    { code: '0163', name: 'TESORO' },
    { code: '0134', name: 'BANESCO' },
    { code: '0175', name: 'BICENTENARIO' },
    { code: '0102', name: 'VENEZUELA' },
    { code: '0105', name: 'MERCANTIL' },
    { code: '0108', name: 'PROVINCIAL' },
    { code: '0114', name: 'BANCARIBE' },
    { code: '0146', name: 'BANGENTE' },
    { code: '0137', name: 'SOFITASA' },
    { code: '0168', name: 'BANCRECER' },
    { code: '0174', name: 'BANPLUS' },
    { code: '0172', name: 'BANCAMIGA' },
];

export default function BeneficiariesPage() {
    const { user } = useAuth();
    const isAdminColombia = user?.role === 'admin_colombia';
    const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
    const [filteredBeneficiaries, setFilteredBeneficiaries] = useState<Beneficiary[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [selectedVendorId, setSelectedVendorId] = useState<string>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBeneficiary, setEditingBeneficiary] = useState<Beneficiary | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [formData, setFormData] = useState<any>({
        fullName: '',
        documentId: '',
        bankName: '',
        accountNumber: '',
        accountType: 'ahorro',
        phone: '',
        isPagoMovil: false,
        clientColombiaId: '',
    });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
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
    const [selectedBeneficiary, setSelectedBeneficiary] = useState<Beneficiary | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    useEffect(() => {
        loadData();
        if (isAdminColombia) {
            loadVendors();
        }
    }, [isAdminColombia, selectedVendorId]);

    const loadVendors = async () => {
        try {
            const data = await usersService.getVendors();
            setVendors(data);
        } catch (error) {
            console.error('Error loading vendors:', error);
        }
    };

    const loadData = async () => {
        try {
            setLoading(true);
            const vendorId = selectedVendorId === 'all' ? undefined : Number(selectedVendorId);
            const [beneficiariesData, clientsData] = await Promise.all([
                beneficiariesService.getBeneficiaries(undefined, vendorId),
                clientsService.getClients(undefined, vendorId),
            ]);
            setBeneficiaries(beneficiariesData);
            setFilteredBeneficiaries(beneficiariesData);
            setClients(clientsData);
            setCurrentPage(1); // Reset to first page when data changes
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        setCurrentPage(1); // Reset to first page on search
        if (!query.trim()) {
            setFilteredBeneficiaries(beneficiaries);
            return;
        }

        const filtered = beneficiaries.filter(ben =>
            ben.fullName.toLowerCase().includes(query.toLowerCase()) ||
            ben.documentId.includes(query) ||
            ben.bankName.toLowerCase().includes(query.toLowerCase()) ||
            ben.accountNumber?.includes(query) ||
            ben.phone?.includes(query)
        );
        setFilteredBeneficiaries(filtered);
    }, [beneficiaries]);

    const handleViewDetails = (beneficiary: Beneficiary) => {
        setSelectedBeneficiary(beneficiary);
        setIsDetailModalOpen(true);
    };

    // Pagination logic
    const totalPages = Math.ceil(filteredBeneficiaries.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentBeneficiaries = filteredBeneficiaries.slice(startIndex, endIndex);

    const openCreateModal = () => {
        setEditingBeneficiary(null);
        setFormData({
            fullName: '',
            documentId: '',
            bankName: '',
            accountNumber: '',
            accountType: 'ahorro',
            phone: '',
            isPagoMovil: false,
            clientColombiaId: '',
        });
        setFormErrors({});
        setIsModalOpen(true);
    };

    const openEditModal = (beneficiary: Beneficiary) => {
        setEditingBeneficiary(beneficiary);
        const clientId = beneficiary.clientColombia?.id || '';
        setFormData({
            fullName: beneficiary.fullName,
            documentId: beneficiary.documentId,
            bankName: beneficiary.bankName,
            accountNumber: beneficiary.accountNumber || '',
            accountType: beneficiary.accountType || 'ahorro',
            phone: beneficiary.phone || '',
            isPagoMovil: beneficiary.isPagoMovil || false,
            clientColombiaId: clientId.toString(),
        });
        setClientSearch('');
        setFormErrors({});
        setIsModalOpen(true);
    };

    const handleDeleteBeneficiary = (beneficiary: Beneficiary) => {
        setConfirmState({
            isOpen: true,
            message: `¿Estás seguro de que deseas eliminar al destinatario ${beneficiary.fullName}? Esta acción no se puede deshacer de forma manual.`,
            onConfirm: async () => {
                try {
                    await beneficiariesService.deleteBeneficiary(beneficiary.id);
                    setConfirmState(prev => ({ ...prev, isOpen: false }));
                    setAlertState({
                        isOpen: true,
                        message: 'Destinatario eliminado correctamente',
                        variant: 'success'
                    });
                    loadData();
                } catch (error) {
                    console.error('Error deleting beneficiary:', error);
                    setAlertState({
                        isOpen: true,
                        message: 'Error al eliminar el destinatario',
                        variant: 'error'
                    });
                }
            }
        });
    };

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};

        if (!formData.isPagoMovil && !formData.fullName.trim()) {
            errors.fullName = 'El nombre es requerido';
        }

        if (!formData.documentId.trim()) {
            errors.documentId = 'El documento es requerido';
        }

        if (!formData.bankName.trim()) {
            errors.bankName = 'El banco es requerido';
        }

        if (formData.isPagoMovil) {
            // Validaciones para Pago Móvil
            if (!formData.phone || !formData.phone.trim()) {
                errors.phone = 'El teléfono es requerido para pago móvil';
            } else {
                // Remover espacios, guiones, paréntesis y símbolos para validar
                const cleanPhone = formData.phone.replace(/[\s\+\-\(\)]/g, '');
                if (!/^04\d{9}$/.test(cleanPhone)) {
                    errors.phone = 'El teléfono de Pago Móvil debe tener 11 dígitos y empezar con 04';
                }
            }
        } else {
            // Validaciones para Transferencia Bancaria
            // Teléfono opcional
            if (formData.phone && formData.phone.trim()) {
                const cleanPhone = formData.phone.replace(/[\s\+\-\(\)]/g, '');
                if (cleanPhone.length < 7 || cleanPhone.length > 13) {
                    errors.phone = 'El teléfono debe tener entre 7 y 13 dígitos';
                } else if (!/^[0-9+\s\-()]*$/.test(formData.phone)) {
                    errors.phone = 'Formato de teléfono no válido';
                }
            }

            if (!formData.accountNumber.trim()) {
                errors.accountNumber = 'El número de cuenta es requerido';
            } else if (!/^\d{20}$/.test(formData.accountNumber.replace(/\s/g, ''))) {
                errors.accountNumber = 'El número de cuenta debe tener 20 dígitos';
            }
        }

        if (!formData.clientColombiaId) {
            errors.clientColombiaId = 'Debes seleccionar un cliente';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        setSaving(true);
        try {
            // Limpiar el teléfono antes de enviar (remover espacios, guiones, etc.)
            const cleanPhone = formData.phone
                ? formData.phone.replace(/[\s\+\-\(\)]/g, '')
                : formData.phone;

            let finalFullName = formData.fullName;
            if (formData.isPagoMovil && !formData.fullName.trim()) {
                const client = clients.find(c => c.id === Number(formData.clientColombiaId));
                const clientName = client ? client.name : '';
                const lastFourDoc = formData.documentId.slice(-4);
                finalFullName = `Pago Movil (${clientName}) ${lastFourDoc}`;
            }

            const dataToSend = {
                ...formData,
                fullName: finalFullName,
                phone: cleanPhone,
                clientColombiaId: Number(formData.clientColombiaId),
            };

            if (editingBeneficiary) {
                await beneficiariesService.updateBeneficiary(editingBeneficiary.id, dataToSend);
            } else {
                await beneficiariesService.createBeneficiary(dataToSend);
            }
            await loadData();
            setIsModalOpen(false);
        } catch (error: any) {
            console.error('Error saving beneficiary:', error);
            setFormErrors({
                general: error.response?.data?.message || 'Error al guardar el destinatario',
            });
        } finally {
            setSaving(false);
        }
    };


    return (
        <div className="p-4 sm:p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    Gestión de Destinatarios
                </h1>
                <p className="text-gray-600">
                    Administra los destinatarios en Venezuela
                </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                    <SearchBar
                        placeholder="Buscar por nombre, documento, banco o cuenta..."
                        onSearch={handleSearch}
                    />
                </div>
                {isAdminColombia && (
                    <div className="w-full sm:w-64">
                        <select
                            value={selectedVendorId}
                            onChange={(e) => setSelectedVendorId(e.target.value)}
                            className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none bg-white font-medium"
                        >
                            <option value="all">Todos los vendedores</option>
                            {vendors.map(vendor => (
                                <option key={vendor.id} value={vendor.id}>
                                    {vendor.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <Button onClick={openCreateModal}>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nuevo Destinatario
                </Button>
            </div>

            <Card>
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
                    </div>
                ) : filteredBeneficiaries.length === 0 ? (
                    <div className="text-center py-12">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        {searchQuery ? (
                            <>
                                <p className="text-gray-500 mb-2">No se encontraron destinatarios con "{searchQuery}"</p>
                                <p className="text-gray-400 text-sm">Intenta con otro término de búsqueda</p>
                            </>
                        ) : (
                            <>
                                <p className="text-gray-500 mb-4">No hay destinatarios registrados</p>
                                <Button onClick={openCreateModal}>Crear primer destinatario</Button>
                            </>
                        )}
                    </div>
                ) : (
                    <>

                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b-2 border-gray-200">
                                    <tr>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase">Nombre</th>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase">Documento</th>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase">Banco</th>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase">Cuenta</th>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase">Cliente</th>
                                        {isAdminColombia && (
                                            <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase">Vendedor</th>
                                        )}
                                        <th className="px-4 lg:px-6 py-3 text-right text-xs md:text-sm font-medium text-gray-500 uppercase">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {currentBeneficiaries.map((beneficiary) => (
                                        <tr key={beneficiary.id} className="hover:bg-gray-50">
                                            <td className="px-4 lg:px-6 py-4">
                                                <div className="font-medium text-gray-900 text-sm">{beneficiary.fullName}</div>
                                                <div className="text-xs text-gray-500">
                                                    {beneficiary.isPagoMovil ? '📱 Pago Móvil' : '🏦 Transferencia'}
                                                    {beneficiary.phone && ` · ${beneficiary.phone}`}
                                                </div>
                                            </td>
                                            <td className="px-4 lg:px-6 py-4 text-gray-600 text-sm">{beneficiary.documentId}</td>
                                            <td className="px-4 lg:px-6 py-4 text-gray-600 text-sm">{beneficiary.bankName}</td>
                                            <td className="px-4 lg:px-6 py-4">
                                                {beneficiary.isPagoMovil ? (
                                                    <div className="text-gray-900 text-sm">
                                                        {beneficiary.phone || '-'}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="text-gray-900 font-mono text-xs md:text-sm">{beneficiary.accountNumber}</div>
                                                        <div className="text-xs text-gray-500 capitalize">{beneficiary.accountType}</div>
                                                    </>
                                                )}
                                            </td>
                                            <td className="px-4 lg:px-6 py-4 text-gray-600 text-sm">
                                                {beneficiary.clientColombia?.name || '-'}
                                            </td>
                                            {isAdminColombia && (
                                                <td className="px-4 lg:px-6 py-4 text-gray-600 text-sm">
                                                    {beneficiary.clientColombia?.vendedor?.name || '-'}
                                                </td>
                                            )}
                                            <td className="px-4 lg:px-6 py-4 text-right text-xs md:text-sm">
                                                <div className="flex gap-2 justify-end">
                                                    <button
                                                        onClick={() => handleViewDetails(beneficiary)}
                                                        className="text-purple-600 hover:text-purple-900 whitespace-nowrap"
                                                    >
                                                        Ver detalles
                                                    </button>
                                                    <button onClick={() => openEditModal(beneficiary)} className="text-blue-600 hover:text-blue-900 whitespace-nowrap">
                                                        Editar
                                                    </button>
                                                    <button onClick={() => handleDeleteBeneficiary(beneficiary)} className="text-red-600 hover:text-red-900 whitespace-nowrap">
                                                        Eliminar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile list */}
                        <div className="md:hidden space-y-3">
                            {currentBeneficiaries.map((beneficiary) => (
                                <div key={beneficiary.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-medium text-gray-900 truncate">{beneficiary.fullName}</div>
                                            <div className="text-sm text-gray-500 truncate">{beneficiary.bankName} · {beneficiary.accountNumber}</div>
                                        </div>
                                        <div className="text-right text-sm text-gray-600">
                                            <div>{beneficiary.clientColombia?.name || '-'}</div>
                                            {isAdminColombia && (
                                                <div className="text-[10px] text-gray-400 italic">Vdor: {beneficiary.clientColombia?.vendedor?.name || '-'}</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between">
                                        <div className="text-sm text-gray-600">{beneficiary.documentId}</div>
                                        <div className="flex gap-3">
                                            <button onClick={() => handleViewDetails(beneficiary)} className="text-purple-600 hover:text-purple-900">Ver detalles</button>
                                            <button onClick={() => openEditModal(beneficiary)} className="text-blue-600 hover:text-blue-900">Editar</button>
                                            <button onClick={() => handleDeleteBeneficiary(beneficiary)} className="text-red-600 hover:text-red-900">Eliminar</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                    </>
                )}

                {/* Pagination */}
                {filteredBeneficiaries.length > itemsPerPage && (
                    <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                            Mostrando {startIndex + 1} - {Math.min(endIndex, filteredBeneficiaries.length)} de {filteredBeneficiaries.length} destinatarios
                        </div>
                        <div className="flex gap-1 sm:gap-2 items-center">
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
                            <div className="flex gap-1 overflow-x-auto max-w-[calc(100vw-200px)] sm:max-w-none">
                                {(() => {
                                    const maxVisible = 5; // Máximo de páginas visibles en móvil
                                    const halfVisible = Math.floor(maxVisible / 2);
                                    let startPage = Math.max(1, currentPage - halfVisible);
                                    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
                                    
                                    if (endPage - startPage < maxVisible - 1) {
                                        startPage = Math.max(1, endPage - maxVisible + 1);
                                    }
                                    
                                    const pages = [];
                                    if (startPage > 1) {
                                        pages.push(1);
                                        if (startPage > 2) pages.push('...');
                                    }
                                    for (let i = startPage; i <= endPage; i++) {
                                        pages.push(i);
                                    }
                                    if (endPage < totalPages) {
                                        if (endPage < totalPages - 1) pages.push('...');
                                        pages.push(totalPages);
                                    }
                                    
                                    return pages.map((page, idx) => (
                                        page === '...' ? (
                                            <span key={`ellipsis-${idx}`} className="px-2 py-2 text-gray-500">...</span>
                                        ) : (
                                            <button
                                                key={page}
                                                onClick={() => setCurrentPage(page as number)}
                                                className={`px-2 sm:px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap ${currentPage === page
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                                                    }`}
                                            >
                                                {page}
                                            </button>
                                        )
                                    ));
                                })()}
                            </div>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
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
            </Card>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingBeneficiary ? 'Editar Destinatario' : 'Nuevo Destinatario'}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {formErrors.general && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {formErrors.general}
                        </div>
                    )}

                    {/* Checkbox Pago Móvil */}
                    <div className="flex items-center gap-3 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
                        <input
                            type="checkbox"
                            id="isPagoMovil"
                            checked={formData.isPagoMovil}
                            onChange={(e) => setFormData({ ...formData, isPagoMovil: e.target.checked })}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="isPagoMovil" className="text-sm font-medium text-blue-900 cursor-pointer">
                            Este destinatario usa Pago Móvil
                        </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Input
                                label={formData.isPagoMovil ? "Nombre (Auto-generado)" : "Nombre completo *"}
                                placeholder={formData.isPagoMovil ? "Se generará automáticamente" : "Ej: María González"}
                                value={formData.fullName}
                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                error={formErrors.fullName}
                                disabled={formData.isPagoMovil && !formData.fullName.trim()}
                            />
                            {formData.isPagoMovil && (
                                <>
                                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                        <p className="text-xs font-medium text-blue-700 mb-1">Vista previa del nombre:</p>
                                        <p className="text-sm font-semibold text-blue-900">
                                            {(() => {
                                                const client = clients.find(c => c.id === Number(formData.clientColombiaId));
                                                const clientName = client ? client.name : 'Cliente no seleccionado';
                                                const lastFourDoc = formData.documentId.slice(-4) || '____';
                                                return `Pago Movil (${clientName}) ${lastFourDoc}`;
                                            })()}
                                        </p>
                                        <p className="text-xs text-blue-600 mt-1">
                                            {formData.fullName.trim() ? 'Usando nombre personalizado' : 'Usando nombre autogenerado'}
                                        </p>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="editName"
                                            checked={!formData.fullName.trim() ? false : true}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    // Habilitar edición: poner el autogenerado como base
                                                    const client = clients.find(c => c.id === Number(formData.clientColombiaId));
                                                    const clientName = client ? client.name : 'Cliente';
                                                    const lastFourDoc = formData.documentId.slice(-4) || '____';
                                                    setFormData({ ...formData, fullName: `Pago Movil (${clientName}) ${lastFourDoc}` });
                                                } else {
                                                    // Deshabilitar edición: limpiar el campo
                                                    setFormData({ ...formData, fullName: '' });
                                                }
                                            }}
                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <label htmlFor="editName" className="text-xs font-medium text-gray-700 cursor-pointer">
                                            Editar nombre manualmente
                                        </label>
                                    </div>
                                </>
                            )}
                        </div>

                        <Input
                            label="Cédula *"
                            placeholder="12345678"
                            type="tel"
                            inputMode="numeric"
                            value={formData.documentId}
                            onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '');
                                setFormData({ ...formData, documentId: value });
                            }}
                            error={formErrors.documentId}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Banco *
                        </label>
                        <div className="relative">
                            <select
                                value={formData.bankName}
                                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                                className={`w-full px-4 py-3 pr-10 border-2 rounded-xl appearance-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none bg-white ${
                                    formErrors.bankName ? 'border-red-500' : 'border-gray-200'
                                }`}
                            >
                                <option value="">Selecciona un banco</option>
                                {VENEZUELAN_BANKS.map(bank => (
                                    <option key={bank.code} value={`${bank.name} (${bank.code})`}>
                                        {bank.name} ({bank.code})
                                    </option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>
                        {formErrors.bankName && (
                            <p className="mt-1 text-sm text-red-600">{formErrors.bankName}</p>
                        )}
                    </div>

                    {formData.isPagoMovil ? (
                        // Campos para Pago Móvil
                        <>
                            <Input
                                label="Teléfono Pago Móvil *"
                                placeholder="04121234567 (11 dígitos, formato: 04XXXXXXXXX)"
                                type="tel"
                                inputMode="tel"
                                value={formData.phone}
                                onChange={(e) => {
                                    // Permitir solo números, espacios, guiones, paréntesis y +
                                    const value = e.target.value.replace(/[^\d\s\-\(\)\+]/g, '');
                                    setFormData({ ...formData, phone: value });
                                }}
                                error={formErrors.phone}
                            />
                            <p className="text-xs text-gray-500 -mt-2">
                                Formato: 04 seguido de 9 dígitos (ej: 04121234567)
                            </p>
                        </>
                    ) : (
                        // Campos para Transferencia Bancaria
                        <>
                            <div>
                                <Input
                                    label="Número de cuenta (20 dígitos) *"
                                    placeholder="01020123456789012345"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={formData.accountNumber}
                                    onChange={(e) => {
                                        const value = e.target.value.replace(/\D/g, '').slice(0, 20);
                                        setFormData({ ...formData, accountNumber: value });
                                    }}
                                    error={formErrors.accountNumber}
                                />
                                <div className="mt-1 flex items-center justify-between">
                                    <div className="text-xs text-gray-500">
                                        {(() => {
                                            const digitsCount = formData.accountNumber.replace(/\D/g, '').length;
                                            const remaining = 20 - digitsCount;
                                            if (digitsCount === 0) {
                                                return 'Ingresa 20 dígitos';
                                            } else if (digitsCount < 20) {
                                                return `Faltan ${remaining} dígitos`;
                                            } else {
                                                return '✓ Número completo';
                                            }
                                        })()}
                                    </div>
                                    <div className="text-xs font-medium">
                                        <span className={`${
                                            formData.accountNumber.replace(/\D/g, '').length === 20
                                                ? 'text-green-600'
                                                : 'text-blue-600'
                                        }`}>
                                            {formData.accountNumber.replace(/\D/g, '').length}/20
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Tipo de cuenta *
                                </label>
                                <select
                                    value={formData.accountType}
                                    onChange={(e) => setFormData({ ...formData, accountType: e.target.value })}
                                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
                                >
                                    <option value="ahorro">Ahorro</option>
                                    <option value="corriente">Corriente</option>
                                </select>
                            </div>

                            <Input
                                label="Teléfono (opcional)"
                                placeholder="+57 300 123 4567"
                                type="tel"
                                inputMode="tel"
                                value={formData.phone}
                                onChange={(e) => {
                                    const value = e.target.value.replace(/[^\d\s\-\(\)\+]/g, '');
                                    setFormData({ ...formData, phone: value });
                                }}
                                error={formErrors.phone}
                            />
                        </>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Cliente asociado *
                        </label>

                        {/* Buscador de clientes */}
                        <div className="mb-2">
                            <input
                                type="text"
                                placeholder="Buscar cliente por nombre o teléfono..."
                                value={clientSearch}
                                onChange={(e) => setClientSearch(e.target.value)}
                                className="w-full px-4 py-2 text-sm border-2 border-gray-200 rounded-xl focus:border-blue-500 transition-all outline-none"
                            />
                        </div>

                        {/* Lista de clientes (Top 3 o Resultados) */}
                        <div className={`border-2 rounded-xl p-2 max-h-48 overflow-y-auto ${formErrors.clientColombiaId ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                            {(() => {
                                // Siempre incluir el cliente seleccionado actualmente
                                const selectedClient = clients.find(c => c.id === Number(formData.clientColombiaId));
                                const filtered = clientSearch.trim() === ''
                                    ? clients.slice(0, 3)
                                    : clients.filter(c =>
                                        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
                                        c.phone.includes(clientSearch)
                                    );

                                // Siempre incluir el cliente seleccionado al principio
                                let displayClients = [...new Set([selectedClient, ...filtered].filter(Boolean))];
                                
                                // Si hay búsqueda, mantener el seleccionado y agregar resultados
                                if (clientSearch.trim() !== '' && selectedClient && !filtered.some(c => c.id === selectedClient.id)) {
                                    displayClients = [selectedClient, ...filtered];
                                }

                                if (displayClients.length === 0) {
                                    return <p className="text-center py-4 text-sm text-gray-500">No se encontraron clientes</p>;
                                }

                                return (
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-400 px-2 uppercase font-bold tracking-wider mb-1">
                                            {clientSearch.trim() === '' ? 'Últimos 3 creados' : 'Resultados de búsqueda'}
                                        </p>
                                        {displayClients.map((client: Client | undefined) => {
                                            if (!client) return null;
                                            return (
                                            <button
                                                key={client.id}
                                                type="button"
                                                onClick={() => {
                                                    setFormData({ ...formData, clientColombiaId: client.id.toString() });
                                                    if (clientSearch) setClientSearch('');
                                                }}
                                                className={`w-full flex items-center justify-between p-2 rounded-lg text-sm transition-all ${formData.clientColombiaId === client.id.toString()
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : 'bg-white hover:bg-blue-100 text-gray-700'
                                                    }`}
                                            >
                                                <span className="font-medium truncate">{client.name}</span>
                                                <span className={`text-xs ${formData.clientColombiaId === client.id.toString() ? 'text-blue-100' : 'text-gray-400'}`}>
                                                    {client.phone}
                                                </span>
                                            </button>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                        {formErrors.clientColombiaId && (
                            <p className="mt-1 text-sm text-red-600">{formErrors.clientColombiaId}</p>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1">
                            Cancelar
                        </Button>
                        <Button type="submit" isLoading={saving} className="flex-1">
                            {editingBeneficiary ? 'Actualizar' : 'Crear'}
                        </Button>
                    </div>
                </form>
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
                title="Confirmar eliminación"
                message={confirmState.message}
                confirmText="Sí, eliminar"
                cancelText="Cancelar"
                variant="danger"
                onConfirm={confirmState.onConfirm}
                onCancel={() => setConfirmState({ isOpen: false, message: '', onConfirm: () => { } })}
            />

            {/* Beneficiary Detail Modal */}
            <Modal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                title="Detalles del Destinatario"
                size="lg"
            >
                {selectedBeneficiary && (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
                            <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                                {selectedBeneficiary.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900">{selectedBeneficiary.fullName}</h3>
                                <p className="text-sm text-gray-500">ID: #{selectedBeneficiary.id}</p>
                            </div>
                        </div>

                        {/* Information Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 bg-gray-50 rounded-xl">
                                <p className="text-xs text-gray-500 mb-1">Documento</p>
                                <p className="text-lg font-semibold text-gray-900">{selectedBeneficiary.documentId}</p>
                            </div>

                            {selectedBeneficiary.phone && (
                                <div className="p-4 bg-gray-50 rounded-xl">
                                    <p className="text-xs text-gray-500 mb-1">Teléfono</p>
                                    <p className="text-lg font-semibold text-gray-900">{selectedBeneficiary.phone}</p>
                                </div>
                            )}

                            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                                <p className="text-xs text-blue-600 mb-1">Banco</p>
                                <p className="text-lg font-semibold text-blue-900">{selectedBeneficiary.bankName}</p>
                            </div>

                            <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                                <p className="text-xs text-green-600 mb-1">Número de Cuenta</p>
                                <p className="text-lg font-mono font-semibold text-green-900">{selectedBeneficiary.accountNumber}</p>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-xl">
                                <p className="text-xs text-gray-500 mb-1">Tipo de Cuenta</p>
                                <p className="text-lg font-semibold text-gray-900 capitalize">{selectedBeneficiary.accountType}</p>
                            </div>

                            {selectedBeneficiary.clientColombia && (
                                <div className="p-4 bg-gray-50 rounded-xl">
                                    <p className="text-xs text-gray-500 mb-1">Cliente</p>
                                    <p className="text-lg font-semibold text-gray-900">{selectedBeneficiary.clientColombia.name}</p>
                                </div>
                            )}

                            <div className="p-4 bg-gray-50 rounded-xl">
                                <p className="text-xs text-gray-500 mb-1">Fecha de Creación</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    {new Date(selectedBeneficiary.createdAt).toLocaleDateString('es-CO', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsDetailModalOpen(false)}
                                className="flex-1"
                            >
                                Cerrar
                            </Button>
                            <Button
                                type="button"
                                onClick={() => {
                                    setIsDetailModalOpen(false);
                                    openEditModal(selectedBeneficiary);
                                }}
                                className="flex-1"
                            >
                                Editar Destinatario
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
