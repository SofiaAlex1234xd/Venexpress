export type TransactionStatus =
    | 'pendiente'
    | 'pendiente_colombia'
    | 'pendiente_venezuela'
    | 'procesando'
    | 'enviado_venezuela'
    | 'completado'
    | 'rechazado'
    | 'cancelado_vendedor'
    | 'cancelado_administrador';

export interface Transaction {
    id: number;
    createdBy: {
        id: number;
        name: string;
        role: string;
        commission?: number; // Comisión del vendedor (2% o 5%)
        adminId?: number; // ID del admin al que pertenece el vendedor
    };
    clientPresencial?: {
        id: number;
        name: string;
        phone: string;
    };
    clientApp?: {
        id: number;
        name: string;
        email: string;
    };

    // Referencia al Destinatario (puede ser null si fue eliminado)
    beneficiary?: {
        id: number;
    };

    // Snapshot de datos del Destinatario (siempre disponibles)
    beneficiaryFullName: string;
    beneficiaryDocumentId: string;
    beneficiaryBankName: string;
    beneficiaryAccountNumber?: string;
    beneficiaryAccountType?: string;
    beneficiaryPhone?: string;
    beneficiaryIsPagoMovil?: boolean;

    amountCOP: number;
    amountBs: number;
    // Tasa de venta usada (campo nuevo en backend). Mantengo rateUsed para compatibilidad visual.
    saleRate?: number;
    // Tasa de compra (se establece después por Admin Venezuela)
    purchaseRate?: number | null;
    isPurchaseRateSet?: boolean;
    rateUsed?: number;
    status: TransactionStatus;
    comprobanteCliente?: string;
    comprobanteVenezuela?: string;
    notes?: string;
    rejectionReason?: string; // Motivo del rechazo (separado de notes)
    isPaidByVendor?: boolean;
    paidByVendorAt?: string;
    vendorPaymentMethod?: 'efectivo' | 'consignacion_nequi' | 'consignacion_bancolombia';
    vendorPaymentProofUrl?: string; // URL del comprobante de pago del vendedor
    vendorPaymentProof?: string; // URL del comprobante de pago inicial del vendedor (para vendedores de Venezuela)
    isCommissionPaidToVendor?: boolean;
    commissionPaidAt?: string;
    hasCustomRate?: boolean; // Indica si el vendedor usó una tasa personalizada
    transactionCommission?: number; // Comisión específica de esta transacción (2%, 4%, 5%, etc.)
    createdAt: string;
    updatedAt: string;
    lastEditedAt?: string;
}

export interface CreateTransactionDto {
    beneficiaryId: number;
    amountCOP?: number;
    amountBs?: number;
    clientPresencialId?: number;
    comprobanteCliente?: string;
    notes?: string;
}

export interface TransactionHistory {
    id: number;
    transaction: {
        id: number;
    };
    status: TransactionStatus;
    note?: string;
    changedBy?: {
        id: number;
        name: string;
        role: string;
    };
    changedAt: string;
}

export interface UpdateTransactionStatusDto {
    status: TransactionStatus;
    comprobanteVenezuela?: string;
    notes?: string;
}

export interface DebtResponse {
    totalDebt: number;
    transactions: Transaction[];
}

// DTO para establecer la tasa de compra (coincide con SetPurchaseRateDto del backend)
export interface SetPurchaseRateDto {
    purchaseRate?: number; // Opcional para permitir eliminar la tasa
    isFinal?: boolean;
    transactionIds?: number[];
    date?: string; // YYYY-MM-DD
    removeRate?: boolean; // Si es true, elimina la tasa de compra
}

export interface PendingPurchaseRateQuery {
    startDate?: string; // YYYY-MM-DD
    endDate?: string;   // YYYY-MM-DD
    vendorId?: number;
}
