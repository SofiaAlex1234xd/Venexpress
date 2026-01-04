import api from './api';
import { Transaction, CreateTransactionDto, TransactionHistory, SetPurchaseRateDto, PendingPurchaseRateQuery } from '@/types/transaction';

export const transactionsService = {
    async getTransactions(limit: number = 10, offset: number = 0, startDate?: string, endDate?: string): Promise<Transaction[]> {
        const params: any = { limit, offset };
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        const response = await api.get<Transaction[]>('/transactions', { params });
        return response.data;
    },

    async getTransaction(id: number): Promise<Transaction> {
        const response = await api.get<Transaction>(`/transactions/${id}`);
        return response.data;
    },

    async createTransaction(data: CreateTransactionDto): Promise<Transaction> {
        const response = await api.post<Transaction>('/transactions', data);
        return response.data;
    },

    async createTransactionWithProof(formData: FormData): Promise<Transaction> {
        const response = await api.post<Transaction>('/transactions/with-proof', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    async getTransactionHistory(id: number): Promise<TransactionHistory[]> {
        const response = await api.get<TransactionHistory[]>(`/transactions/${id}/history`);
        return response.data;
    },

    async updateTransaction(id: number, data: any): Promise<Transaction> {
        const response = await api.patch<Transaction>(`/transactions/${id}`, data);
        return response.data;
    },

    async enterEditMode(id: number): Promise<Transaction> {
        const response = await api.post<Transaction>(`/transactions/${id}/enter-edit`);
        return response.data;
    },

    async cancelTransaction(id: number): Promise<Transaction> {
        const response = await api.post<Transaction>(`/transactions/${id}/cancel`);
        return response.data;
    },

    async getDebt(period?: string, startDate?: string, endDate?: string): Promise<{ totalDebt: number; paidAmount: number; transactions: Transaction[] }> {
        const response = await api.get('/transactions/debt', {
            params: { period, startDate, endDate },
        });
        return response.data;
    },

    async markAsPaid(transactionIds: number[], paymentMethod: string, proof?: File): Promise<void> {
        const formData = new FormData();
        formData.append('transactionIds', JSON.stringify(transactionIds));
        formData.append('paymentMethod', paymentMethod);
        if (proof) {
            formData.append('proof', proof);
        }

        await api.post('/transactions/mark-as-paid', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
    },

    async markDateRangeAsPaid(startDate: string, endDate: string, paymentMethod: string, proof?: File): Promise<{ affected: number }> {
        const formData = new FormData();
        formData.append('startDate', startDate);
        formData.append('endDate', endDate);
        formData.append('paymentMethod', paymentMethod);
        if (proof) {
            formData.append('proof', proof);
        }

        const response = await api.post<{ affected: number }>('/transactions/mark-date-range-as-paid', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    async unmarkAsPaid(transactionId: number): Promise<void> {
        await api.post(`/transactions/unmark-as-paid/${transactionId}`);
    },

    async updatePayment(transactionId: number, paymentMethod?: string, proof?: File): Promise<void> {
        const formData = new FormData();
        if (paymentMethod) {
            formData.append('paymentMethod', paymentMethod);
        }
        if (proof) {
            formData.append('proof', proof);
        }

        await api.patch(`/transactions/update-payment/${transactionId}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
    },

    // Admin Venezuela methods
    async getPendingVenezuela(): Promise<Transaction[]> {
        const response = await api.get<Transaction[]>('/transactions/pending-venezuela');
        return response.data;
    },

    async completeTransfer(id: number, voucher?: File, accountId?: number): Promise<Transaction> {
        const formData = new FormData();
        if (voucher) {
            formData.append('voucher', voucher);
        }
        if (accountId) {
            formData.append('accountId', accountId.toString());
        }
        const response = await api.post<Transaction>(`/transactions/${id}/complete`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    async rejectTransfer(id: number, reason: string, voucher?: File): Promise<Transaction> {
        const formData = new FormData();
        formData.append('reason', reason);
        if (voucher) {
            formData.append('voucher', voucher);
        }
        const response = await api.post<Transaction>(`/transactions/${id}/reject`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    async cancelByAdmin(id: number, reason: string): Promise<Transaction> {
        const response = await api.post<Transaction>(`/transactions/${id}/cancel-admin`, { reason });
        return response.data;
    },

    async updateVoucher(id: number, voucher: File): Promise<Transaction> {
        const formData = new FormData();
        formData.append('voucher', voucher);
        const response = await api.post<Transaction>(`/transactions/${id}/update-voucher`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    async getTransferHistory(status?: string, startDate?: string, endDate?: string): Promise<Transaction[]> {
        const response = await api.get<Transaction[]>('/transactions/history-admin', {
            params: { status, startDate, endDate },
        });
        return response.data;
    },

    async getReports(startDate?: string, endDate?: string): Promise<any> {
        const response = await api.get('/transactions/reports', {
            params: { startDate, endDate },
        });
        return response.data;
    },

    async resendRejectedTransaction(id: number, updateData: any): Promise<Transaction> {
        const response = await api.post<Transaction>(`/transactions/${id}/resend`, updateData);
        return response.data;
    },

    async getVendorReports(startDate?: string, endDate?: string): Promise<any> {
        const response = await api.get('/transactions/vendor-reports', {
            params: { startDate, endDate },
        });
        return response.data;
    },

    async getVendorHistory(params: any): Promise<any> {
        const response = await api.get('/transactions/vendor-history', { params });
        return response.data;
    },

    // --- Tasa de compra (Admin Venezuela) ---

    async getPendingPurchaseRateTransactions(query: PendingPurchaseRateQuery): Promise<Transaction[]> {
        const response = await api.get<Transaction[]>('/transactions/pending-purchase-rate', { params: query });
        return response.data;
    },

    async getTransactionsWithPurchaseRate(query: PendingPurchaseRateQuery): Promise<Transaction[]> {
        const response = await api.get<Transaction[]>('/transactions/with-purchase-rate', { params: query });
        return response.data;
    },

    async setPurchaseRate(id: number, dto: SetPurchaseRateDto): Promise<Transaction> {
        const response = await api.patch<Transaction>(`/transactions/${id}/purchase-rate`, dto);
        return response.data;
    },

    async bulkSetPurchaseRate(dto: SetPurchaseRateDto): Promise<{ message: string; affected: number }> {
        const response = await api.post<{ message: string; affected: number }>('/transactions/bulk/purchase-rate', dto);
        return response.data;
    },

    // Admin Colombia methods
    async getPendingAdminColombia(): Promise<Transaction[]> {
        const response = await api.get<Transaction[]>('/transactions/admin-colombia/pending');
        return response.data;
    },

    async getHistoryAdminColombia(status?: string, startDate?: string, endDate?: string, vendorId?: number): Promise<Transaction[]> {
        const response = await api.get<Transaction[]>('/transactions/admin-colombia/history', {
            params: { status, startDate, endDate, vendorId },
        });
        return response.data;
    },

    async getReportsAdminColombia(startDate?: string, endDate?: string, vendorId?: number): Promise<any> {
        const response = await api.get('/transactions/admin-colombia/reports', {
            params: { startDate, endDate, vendorId },
        });
        return response.data;
    },

    async getReportsCSV(startDate?: string, endDate?: string): Promise<any> {
        const response = await api.get('/transactions/reports/csv', {
            params: { startDate, endDate },
        });
        return response.data;
    },

    async getReportsAdminColombiaCSV(startDate?: string, endDate?: string): Promise<any> {
        const response = await api.get('/transactions/admin-colombia/reports/csv', {
            params: { startDate, endDate },
        });
        return response.data;
    },

    async getAdminColombiaFinancialSummary(startDate?: string, endDate?: string): Promise<any> {
        const response = await api.get('/transactions/admin-colombia/financial-summary', {
            params: { startDate, endDate },
        });
        return response.data;
    },

    async getAdminVenezuelaFinancialSummary(startDate?: string, endDate?: string): Promise<any> {
        const response = await api.get('/transactions/admin-venezuela/financial-summary', {
            params: { startDate, endDate },
        });
        return response.data;
    },

    async markVendorCommissionAsPaid(transactionIds: number[]): Promise<{ affected: number }> {
        const response = await api.post<{ affected: number }>('/transactions/admin-colombia/commission/mark-paid', {
            transactionIds,
        });
        return response.data;
    },

    async getMonthlyStats(): Promise<any[]> {
        const response = await api.get('/transactions/stats/monthly');
        return response.data;
    },

    /**
     * Obtiene URLs firmadas para los comprobantes de una transacción
     */
    async getTransactionProofs(id: number): Promise<{ comprobanteCliente?: string; comprobanteVenezuela?: string }> {
        const response = await api.get<{ comprobanteCliente?: string; comprobanteVenezuela?: string }>(`/transactions/${id}/proofs`);
        return response.data;
    },

    // Venezuela Debt endpoints
    /**
     * Obtiene el detalle completo de la deuda con Admin Venezuela
     */
    async getVenezuelaDebtDetail(startDate?: string, endDate?: string): Promise<any> {
        const response = await api.get('/transactions/venezuela-debt/detail', {
            params: { startDate, endDate },
        });
        return response.data;
    },

    /**
     * Registra un pago a Admin Venezuela
     */
    async createVenezuelaPayment(data: { amount: number; notes?: string; proofUrl?: string; paymentDate: string; proof?: File }): Promise<any> {
        const formData = new FormData();
        formData.append('amount', data.amount.toString());
        formData.append('paymentDate', data.paymentDate);
        if (data.notes) {
            formData.append('notes', data.notes);
        }
        if (data.proof) {
            formData.append('proof', data.proof);
        }
        if (data.proofUrl) {
            formData.append('proofUrl', data.proofUrl);
        }

        const response = await api.post('/transactions/venezuela-debt/payment', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    /**
     * Obtiene el historial de pagos a Venezuela
     */
    async getVenezuelaPaymentHistory(): Promise<any[]> {
        const response = await api.get('/transactions/venezuela-debt/payments');
        return response.data;
    },

    /**
     * Elimina un pago a Venezuela
     */
    async deleteVenezuelaPayment(id: number): Promise<void> {
        await api.delete(`/transactions/venezuela-debt/payment/${id}`);
    },

    /**
     * Obtiene el historial de transacciones de Admin Venezuela (de sus vendedores)
     */
    async getHistoryAdminVenezuela(status?: string, startDate?: string, endDate?: string, vendorId?: number): Promise<Transaction[]> {
        const response = await api.get<Transaction[]>('/transactions/admin-venezuela/history', {
            params: { status, startDate, endDate, vendorId },
        });
        return response.data;
    },

    /**
     * Marca la comisión como pagada al vendedor para Admin Venezuela
     */
    async markVendorCommissionAsPaidVenezuela(transactionIds: number[]): Promise<{ affected: number }> {
        const response = await api.post<{ affected: number }>('/transactions/admin-venezuela/commission/mark-paid', {
            transactionIds,
        });
        return response.data;
    },
};
