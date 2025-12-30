'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import SearchBar from '@/components/ui/SearchBar';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Alert from '@/components/ui/Alert';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { clientsService } from '@/services/clients.service';
import { Client, CreateClientDto } from '@/types/client';

export default function ClientsPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [filteredClients, setFilteredClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [formData, setFormData] = useState<CreateClientDto>({
        name: '',
        phone: '',
        documentId: '',
    });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
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
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    useEffect(() => {
        loadClients();
    }, []);

    const loadClients = async () => {
        try {
            const data = await clientsService.getClients();
            setClients(data);
            setFilteredClients(data);
        } catch (error) {
            console.error('Error loading clients:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        setCurrentPage(1); // Reset to first page on search
        if (!query.trim()) {
            setFilteredClients(clients);
            return;
        }

        const filtered = clients.filter(client =>
            client.name.toLowerCase().includes(query.toLowerCase()) ||
            client.phone.includes(query) ||
            (client.documentId && client.documentId.includes(query))
        );
        setFilteredClients(filtered);
    };

    const handleViewDetails = (client: Client) => {
        setSelectedClient(client);
        setIsDetailModalOpen(true);
    };

    // Pagination logic
    const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentClients = filteredClients.slice(startIndex, endIndex);

    const openCreateModal = () => {
        setEditingClient(null);
        setFormData({ name: '', phone: '', documentId: '' });
        setFormErrors({});
        setIsModalOpen(true);
    };

    const openEditModal = (client: Client) => {
        setEditingClient(client);
        setFormData({
            name: client.name,
            phone: client.phone,
            documentId: client.documentId || '',
        });
        setFormErrors({});
        setIsModalOpen(true);
    };

    const handleDeleteClient = async (client: Client) => {
        try {
            const count = await clientsService.getBeneficiaryCount(client.id);

            let message = `¿Estás seguro de que deseas eliminar al cliente ${client.name}? Esta acción no se puede deshacer de forma manual.`;

            if (count > 0) {
                message = `Este cliente tiene ${count} destinatario(s) asociado(s). Si lo eliminas, estos destinatarios también serán eliminados automáticamente. ¿Deseas continuar?`;
            }

            setConfirmState({
                isOpen: true,
                message: message,
                onConfirm: async () => {
                    try {
                        await clientsService.deleteClient(client.id);
                        setConfirmState(prev => ({ ...prev, isOpen: false }));
                        setAlertState({
                            isOpen: true,
                            message: 'Cliente eliminado correctamente',
                            variant: 'success'
                        });
                        loadClients();
                    } catch (error) {
                        console.error('Error deleting client:', error);
                        setAlertState({
                            isOpen: true,
                            message: 'Error al eliminar el cliente',
                            variant: 'error'
                        });
                    }
                }
            });
        } catch (error) {
            console.error('Error fetching beneficiary count:', error);
            // Si hay error al contar, procedemos con el mensaje estándar por seguridad
            setConfirmState({
                isOpen: true,
                message: `¿Estás seguro de que deseas eliminar al cliente ${client.name}? Esta acción no se puede deshacer de forma manual.`,
                onConfirm: async () => {
                    // ... mismo bloque de confirmación ...
                    try {
                        await clientsService.deleteClient(client.id);
                        setConfirmState(prev => ({ ...prev, isOpen: false }));
                        setAlertState({
                            isOpen: true,
                            message: 'Cliente eliminado correctamente',
                            variant: 'success'
                        });
                        loadClients();
                    } catch (err) {
                        setAlertState({
                            isOpen: true,
                            message: 'Error al eliminar el cliente',
                            variant: 'error'
                        });
                    }
                }
            });
        }
    };

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};

        if (!formData.name.trim()) {
            errors.name = 'El nombre es requerido';
        } else if (formData.name.trim().length < 3) {
            errors.name = 'El nombre debe tener al menos 3 caracteres';
        }

        const cleanPhone = formData.phone.replace(/[\s\+\-\(\)]/g, '');
        if (!formData.phone.trim()) {
            errors.phone = 'El teléfono es requerido';
        } else if (cleanPhone.length < 7 || cleanPhone.length > 13) {
            errors.phone = 'El teléfono debe tener entre 7 y 13 dígitos';
        } else if (!/^[0-9+\s\-()]*$/.test(formData.phone)) {
            errors.phone = 'Formato de teléfono no válido';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        setSaving(true);
        try {
            if (editingClient) {
                await clientsService.updateClient(editingClient.id, formData);
            } else {
                await clientsService.createClient(formData);
            }
            await loadClients();
            setIsModalOpen(false);
        } catch (error: any) {
            console.error('Error saving client:', error);
            setFormErrors({
                general: error.response?.data?.message || 'Error al guardar el cliente',
            });
        } finally {
            setSaving(false);
        }
    };


    return (
        <div className="p-4 sm:p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    Gestión de Clientes
                </h1>
                <p className="text-gray-600">
                    Administra tus clientes presenciales
                </p>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                    <SearchBar
                        placeholder="Buscar por nombre, teléfono o documento..."
                        onSearch={handleSearch}
                    />
                </div>
                <Button onClick={openCreateModal}>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nuevo Cliente
                </Button>
            </div>

            {/* Clients List */}
            <Card>
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
                    </div>
                ) : filteredClients.length === 0 ? (
                    <div className="text-center py-12">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {searchQuery ? (
                            <>
                                <p className="text-gray-500 mb-2">No se encontraron clientes con "{searchQuery}"</p>
                                <p className="text-gray-400 text-sm">Intenta con otro término de búsqueda</p>
                            </>
                        ) : (
                            <>
                                <p className="text-gray-500 mb-4">No hay clientes registrados</p>
                                <Button onClick={openCreateModal}>Crear primer cliente</Button>
                            </>
                        )}
                    </div>
                ) : (
                    <>

                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b-2 border-gray-200">
                                    <tr>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                            Nombre
                                        </th>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                            Teléfono
                                        </th>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                            Documento
                                        </th>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                            Fecha Registro
                                        </th>
                                        <th className="px-4 lg:px-6 py-3 text-right text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                            Acciones
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {currentClients.map((client) => (
                                        <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold mr-3 flex-shrink-0">
                                                        {client.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="font-medium text-gray-900 text-sm">{client.name}</div>
                                                </div>
                                            </td>
                                            <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-gray-600 text-sm">
                                                {client.phone}
                                            </td>
                                            <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-gray-600 text-sm">
                                                {client.documentId || '-'}
                                            </td>
                                            <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-gray-600 text-xs md:text-sm">
                                                {new Date(client.createdAt).toLocaleDateString('es-CO')}
                                            </td>
                                            <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-right text-xs md:text-sm font-medium">
                                                <div className="flex gap-2 justify-end">
                                                    <button
                                                        onClick={() => handleViewDetails(client)}
                                                        className="text-purple-600 hover:text-purple-900 whitespace-nowrap"
                                                    >
                                                        Ver detalles
                                                    </button>
                                                    <button
                                                        onClick={() => openEditModal(client)}
                                                        className="text-blue-600 hover:text-blue-900 whitespace-nowrap"
                                                    >
                                                        Editar
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteClient(client)}
                                                        className="text-red-600 hover:text-red-900 whitespace-nowrap"
                                                    >
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
                            {currentClients.map((client) => (
                                <div key={client.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold mr-2">{client.name.charAt(0).toUpperCase()}</div>
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-900 truncate">{client.name}</div>
                                                <div className="text-sm text-gray-500 truncate">{client.phone}</div>
                                            </div>
                                        </div>
                                        <div className="text-sm text-gray-600">{new Date(client.createdAt).toLocaleDateString('es-CO')}</div>
                                    </div>
                                    <div className="mt-3 flex items-center justify-end gap-3">
                                        <button onClick={() => handleViewDetails(client)} className="text-purple-600 hover:text-purple-900">Ver detalles</button>
                                        <button onClick={() => openEditModal(client)} className="text-blue-600 hover:text-blue-900">Editar</button>
                                        <button onClick={() => handleDeleteClient(client)} className="text-red-600 hover:text-red-900">Eliminar</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                    </>
                )}

                {/* Pagination */}
                {filteredClients.length > itemsPerPage && (
                    <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                            Mostrando {startIndex + 1} - {Math.min(endIndex, filteredClients.length)} de {filteredClients.length} clientes
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Anterior
                            </button>
                            <div className="flex gap-1">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`px-3 py-2 text-sm font-medium rounded-lg ${currentPage === page
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                                            }`}
                                    >
                                        {page}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}
            </Card>

            {/* Create/Edit Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
                size="md"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {formErrors.general && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {formErrors.general}
                        </div>
                    )}

                    <Input
                        label="Nombre completo"
                        placeholder="Ej: Juan Pérez"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        error={formErrors.name}
                    />

                    <Input
                        label="Teléfono"
                        placeholder="+57 300 123 4567"
                        type="tel"
                        inputMode="tel"
                        value={formData.phone}
                        onChange={(e) => {
                            // Permitir solo números, espacios, guiones, paréntesis y el símbolo +
                            const value = e.target.value.replace(/[^\d\s\-\(\)\+]/g, '');
                            setFormData({ ...formData, phone: value });
                        }}
                        error={formErrors.phone}
                    />

                    <Input
                        label="Documento (opcional)"
                        placeholder="1234567890"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={formData.documentId}
                        onChange={(e) => setFormData({ ...formData, documentId: e.target.value })}
                        error={formErrors.documentId}
                    />

                    <div className="flex gap-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1"
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" isLoading={saving} className="flex-1">
                            {editingClient ? 'Actualizar' : 'Crear'}
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

            {/* Client Detail Modal */}
            <Modal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                title="Detalles del Cliente"
                size="md"
            >
                {selectedClient && (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                                {selectedClient.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900">{selectedClient.name}</h3>
                                <p className="text-sm text-gray-500">ID: #{selectedClient.id}</p>
                            </div>
                        </div>

                        {/* Information Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 bg-gray-50 rounded-xl">
                                <p className="text-xs text-gray-500 mb-1">Teléfono</p>
                                <p className="text-lg font-semibold text-gray-900">{selectedClient.phone}</p>
                            </div>

                            {selectedClient.documentId && (
                                <div className="p-4 bg-gray-50 rounded-xl">
                                    <p className="text-xs text-gray-500 mb-1">Documento</p>
                                    <p className="text-lg font-semibold text-gray-900">{selectedClient.documentId}</p>
                                </div>
                            )}

                            <div className="p-4 bg-gray-50 rounded-xl">
                                <p className="text-xs text-gray-500 mb-1">Fecha de Creación</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    {new Date(selectedClient.createdAt).toLocaleDateString('es-CO', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </p>
                            </div>

                            {selectedClient.vendedor && (
                                <div className="p-4 bg-gray-50 rounded-xl">
                                    <p className="text-xs text-gray-500 mb-1">Vendedor</p>
                                    <p className="text-lg font-semibold text-gray-900">{selectedClient.vendedor.name}</p>
                                </div>
                            )}
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
                                    openEditModal(selectedClient);
                                }}
                                className="flex-1"
                            >
                                Editar Cliente
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
