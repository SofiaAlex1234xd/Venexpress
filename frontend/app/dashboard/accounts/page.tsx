'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { accountsService } from '@/services/accounts.service';
import { Account, AccountSummary, AccountTransaction } from '@/types/account';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Alert from '@/components/ui/Alert';

export default function AccountsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddBalanceModalOpen, setIsAddBalanceModalOpen] = useState(false);
  const [isUpdateBalanceModalOpen, setIsUpdateBalanceModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [createFormData, setCreateFormData] = useState({ name: '', initialBalance: '' });
  const [addBalanceFormData, setAddBalanceFormData] = useState({ amount: '', description: '' });
  const [updateBalanceFormData, setUpdateBalanceFormData] = useState({ balance: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    message: string;
    variant?: 'error' | 'success' | 'warning' | 'info';
  }>({ isOpen: false, message: '', variant: 'info' });

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'admin_venezuela') {
      router.push('/dashboard');
      return;
    }
    loadSummary();
  }, [user, authLoading, router]);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const data = await accountsService.getSummary();
      setSummary(data);
    } catch (error: any) {
      console.error('Error loading accounts summary:', error);
      setAlertState({
        isOpen: true,
        message: error.response?.data?.message || 'Error al cargar las cuentas',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!createFormData.name.trim()) {
      newErrors.name = 'El nombre de la cuenta es requerido';
    }

    if (createFormData.initialBalance && parseFloat(createFormData.initialBalance) < 0) {
      newErrors.initialBalance = 'El saldo inicial no puede ser negativo';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSaving(true);
    try {
      await accountsService.create({
        name: createFormData.name,
        initialBalance: createFormData.initialBalance ? parseFloat(createFormData.initialBalance) : 0,
      });
      setIsCreateModalOpen(false);
      setCreateFormData({ name: '', initialBalance: '' });
      setErrors({});
      await loadSummary();
      setAlertState({
        isOpen: true,
        message: 'Cuenta creada exitosamente',
        variant: 'success',
      });
    } catch (error: any) {
      setErrors({ general: error.response?.data?.message || 'Error al crear la cuenta' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;

    const newErrors: Record<string, string> = {};

    if (!addBalanceFormData.amount || parseFloat(addBalanceFormData.amount) <= 0) {
      newErrors.amount = 'El monto debe ser mayor a 0';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSaving(true);
    try {
      await accountsService.addBalance(selectedAccount.id, {
        amount: parseFloat(addBalanceFormData.amount),
        description: addBalanceFormData.description || undefined,
      });
      setIsAddBalanceModalOpen(false);
      setAddBalanceFormData({ amount: '', description: '' });
      setSelectedAccount(null);
      setErrors({});
      await loadSummary();
      setAlertState({
        isOpen: true,
        message: 'Saldo agregado exitosamente',
        variant: 'success',
      });
    } catch (error: any) {
      setErrors({ general: error.response?.data?.message || 'Error al agregar saldo' });
    } finally {
      setIsSaving(false);
    }
  };

  const openAddBalanceModal = (account: Account) => {
    setSelectedAccount(account);
    setAddBalanceFormData({ amount: '', description: '' });
    setErrors({});
    setIsAddBalanceModalOpen(true);
  };

  const openUpdateBalanceModal = (account: Account) => {
    setSelectedAccount(account);
    setUpdateBalanceFormData({ balance: parseFloat(account.balance.toString()).toString() });
    setErrors({});
    setIsUpdateBalanceModalOpen(true);
  };

  const handleUpdateBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;

    const newErrors: Record<string, string> = {};

    if (!updateBalanceFormData.balance || parseFloat(updateBalanceFormData.balance) < 0) {
      newErrors.balance = 'El saldo debe ser mayor o igual a 0';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSaving(true);
    try {
      await accountsService.updateBalance(selectedAccount.id, {
        balance: parseFloat(updateBalanceFormData.balance),
      });
      setIsUpdateBalanceModalOpen(false);
      setUpdateBalanceFormData({ balance: '' });
      setSelectedAccount(null);
      setErrors({});
      await loadSummary();
      setAlertState({
        isOpen: true,
        message: 'Saldo actualizado exitosamente',
        variant: 'success',
      });
    } catch (error: any) {
      setErrors({ general: error.response?.data?.message || 'Error al actualizar el saldo' });
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('es-CO', { maximumFractionDigits: 2 });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600"></div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="p-4 sm:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Gestión de Saldos</h1>
        <p className="text-gray-600">Administra tus cuentas y sus saldos en bolívares</p>
      </div>

      {/* Total Balance Card */}
      <div className="mb-6">
        <Card className="bg-gradient-to-br from-emerald-500 to-green-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm mb-1">Saldo Total</p>
              <p className="text-5xl font-bold">{formatCurrency(summary.totalBalance)} Bs</p>
              <p className="text-emerald-100 text-sm mt-2">{summary.accounts.length} cuenta(s)</p>
            </div>
            <svg className="w-20 h-20 opacity-50" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
              <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
            </svg>
          </div>
        </Card>
      </div>

      {/* Create Account Button */}
      <div className="mb-6">
        <Button
          onClick={() => {
            setCreateFormData({ name: '', initialBalance: '' });
            setErrors({});
            setIsCreateModalOpen(true);
          }}
          className="w-full sm:w-auto"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva Cuenta
        </Button>
      </div>

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {summary.accounts.map((account) => (
          <Card key={account.id} className="hover:shadow-xl transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">{account.name}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Creada: {new Date(account.createdAt).toLocaleDateString('es-CO')}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                  <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                </svg>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-1">Saldo disponible</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(account.balance)} Bs</p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => openAddBalanceModal(account)}
                variant="outline"
                className="flex-1"
                size="sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Agregar
              </Button>
              <Button
                onClick={() => openUpdateBalanceModal(account)}
                variant="outline"
                className="flex-1"
                size="sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar
              </Button>
            </div>
          </Card>
        ))}

        {summary.accounts.length === 0 && (
          <div className="col-span-full">
            <Card className="text-center py-12">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <p className="text-gray-500 text-lg mb-2">No tienes cuentas registradas</p>
              <p className="text-gray-400 text-sm mb-4">Crea tu primera cuenta para comenzar a gestionar tus saldos</p>
              <Button
                onClick={() => {
                  setCreateFormData({ name: '', initialBalance: '' });
                  setErrors({});
                  setIsCreateModalOpen(true);
                }}
              >
                Crear Primera Cuenta
              </Button>
            </Card>
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      {summary.recentTransactions.length > 0 && (() => {
        const totalPages = Math.ceil(summary.recentTransactions.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedTransactions = summary.recentTransactions.slice(startIndex, endIndex);

        return (
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
              <h2 className="text-xl font-bold text-gray-900">Historial Reciente</h2>
              <div className="text-sm text-gray-600">
                Mostrando {startIndex + 1} - {Math.min(endIndex, summary.recentTransactions.length)} de {summary.recentTransactions.length} transacciones
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cuenta</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo Resultante</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedTransactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {new Date(transaction.createdAt).toLocaleString('es-CO', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {transaction.account.name}
                      </td>
                      <td className="px-4 py-3">
                        {transaction.type === 'deposit' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ↑ Depósito
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            ↓ Retiro
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${transaction.type === 'deposit' ? 'text-green-600' : 'text-red-600'}`}>
                        {transaction.type === 'deposit' ? '+' : '-'}{formatCurrency(transaction.amount)} Bs
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {transaction.description}
                        {transaction.transaction && (
                          <span className="ml-2 text-blue-600">
                            (Transacción #{transaction.transaction.id})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(transaction.balanceAfter)} Bs
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-700">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            )}
          </Card>
        );
      })()}

      {/* Create Account Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Crear Nueva Cuenta"
        size="md"
      >
        <form onSubmit={handleCreateAccount} className="space-y-4">
          {errors.general && (
            <p className="text-red-600 text-sm">{errors.general}</p>
          )}
          <div>
            <Input
              label="Nombre de la Cuenta *"
              type="text"
              value={createFormData.name}
              onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
              error={errors.name}
              placeholder="Ej: Bancolombia, Davivienda"
            />
          </div>
          <div>
            <Input
              label="Saldo Inicial (Bs)"
              type="number"
              step="0.01"
              value={createFormData.initialBalance}
              onChange={(e) => setCreateFormData({ ...createFormData, initialBalance: e.target.value })}
              error={errors.initialBalance}
              placeholder="0.00"
            />
            <p className="text-xs text-gray-500 mt-1">Opcional. Puedes agregar saldo después.</p>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              isLoading={isSaving}
            >
              Crear Cuenta
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Balance Modal */}
      <Modal
        isOpen={isAddBalanceModalOpen}
        onClose={() => setIsAddBalanceModalOpen(false)}
        title={`Agregar Saldo: ${selectedAccount?.name}`}
        size="md"
      >
        <form onSubmit={handleAddBalance} className="space-y-4">
          {errors.general && (
            <p className="text-red-600 text-sm">{errors.general}</p>
          )}
          {selectedAccount && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
              <p className="text-sm text-blue-900">
                <strong>Saldo actual:</strong> {formatCurrency(selectedAccount.balance)} Bs
              </p>
            </div>
          )}
          <div>
            <Input
              label="Monto a Agregar (Bs) *"
              type="number"
              step="0.01"
              value={addBalanceFormData.amount}
              onChange={(e) => setAddBalanceFormData({ ...addBalanceFormData, amount: e.target.value })}
              error={errors.amount}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descripción (Opcional)
            </label>
            <textarea
              value={addBalanceFormData.description}
              onChange={(e) => setAddBalanceFormData({ ...addBalanceFormData, description: e.target.value })}
              placeholder="Ej: Depósito del día..."
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none resize-none"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddBalanceModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              isLoading={isSaving}
            >
              Agregar Saldo
            </Button>
          </div>
        </form>
      </Modal>

      {/* Update Balance Modal */}
      <Modal
        isOpen={isUpdateBalanceModalOpen}
        onClose={() => setIsUpdateBalanceModalOpen(false)}
        title={`Editar Saldo: ${selectedAccount?.name}`}
        size="md"
      >
        <form onSubmit={handleUpdateBalance} className="space-y-4">
          {errors.general && (
            <p className="text-red-600 text-sm">{errors.general}</p>
          )}
          {selectedAccount && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
              <p className="text-sm text-blue-900">
                <strong>Saldo actual:</strong> {formatCurrency(parseFloat(selectedAccount.balance.toString()))} Bs
              </p>
              <p className="text-xs text-blue-700 mt-2">
                Ingresa el nuevo saldo total que deseas establecer para esta cuenta.
              </p>
            </div>
          )}
          <div>
            <Input
              label="Nuevo Saldo Total (Bs) *"
              type="number"
              step="0.01"
              value={updateBalanceFormData.balance}
              onChange={(e) => setUpdateBalanceFormData({ ...updateBalanceFormData, balance: e.target.value })}
              error={errors.balance}
              placeholder="0.00"
            />
            <p className="text-xs text-gray-500 mt-1">
              Se registrará automáticamente la diferencia como depósito o retiro.
            </p>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsUpdateBalanceModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              isLoading={isSaving}
            >
              Actualizar Saldo
            </Button>
          </div>
        </form>
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

