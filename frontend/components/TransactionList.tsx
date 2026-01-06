import { Transaction } from '@/types/transaction';
import Badge from '@/components/ui/Badge';

interface TransactionListProps {
    transactions: Transaction[];
    loading: boolean;
    pagination: {
        page: number;
        lastPage: number;
        total: number;
    };
    onPageChange: (page: number) => void;
    showSelection?: boolean;
    selectedTransactions?: number[];
    onSelectTransaction?: (id: number) => void;
    onSelectAll?: () => void;
    showVendorPaymentMethod?: boolean;
    showPaymentActions?: boolean;
    onUnmarkPaid?: (transactionId: number) => void;
    onEditPayment?: (transaction: Transaction) => void;
    showUnmarkButton?: boolean; // Nueva prop para mostrar botón de desmarcar en historial de pagos
    showVerifyButton?: boolean; // Nueva prop para mostrar botón de verificar pago (Admin)
    onVerifyPayment?: (transactionId: number) => void; // Handler para verificar pago
}

export default function TransactionList({
    transactions,
    loading,
    pagination,
    onPageChange,
    showSelection = false,
    selectedTransactions = [],
    onSelectTransaction,
    onSelectAll,
    showVendorPaymentMethod = false,
    showPaymentActions = false,
    onUnmarkPaid,
    onEditPayment,
    showUnmarkButton = false,
    showVerifyButton = false,
    onVerifyPayment
}: TransactionListProps) {

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

    if (loading) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-4">Cargando...</p>
            </div>
        );
    }

    if (transactions.length === 0) {
        return (
            <div className="p-12 text-center">
                <svg
                    className="w-16 h-16 text-gray-300 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                </svg>
                <p className="text-gray-500 text-lg">No hay transacciones en este período</p>
            </div>
        );
    }

    return (
        <div>
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            {showSelection && onSelectAll && (
                                <th className="px-4 lg:px-6 py-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedTransactions.length === transactions.length && transactions.length > 0}
                                        onChange={onSelectAll}
                                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                </th>
                            )}
                            <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                ID
                            </th>
                            <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                Cliente
                            </th>
                            <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                Destinatario
                            </th>
                            <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                Monto COP
                            </th>
                            <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                Fecha
                            </th>
                            <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                Estado
                            </th>
                            {showVendorPaymentMethod && (
                                <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                    Método de Pago
                                </th>
                            )}
                            {transactions.some(tx => tx.isPaidByVendor && tx.vendorPaymentProofUrl) && (
                                <th className="px-4 lg:px-6 py-3 text-center text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                    Comprobante
                                </th>
                            )}
                            {showPaymentActions && (
                                <th className="px-4 lg:px-6 py-3 text-center text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                    Acciones
                                </th>
                            )}
                            {showUnmarkButton && (
                                <th className="px-4 lg:px-6 py-3 text-center text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                    Acción
                                </th>
                            )}
                            {showVerifyButton && (
                                <th className="px-4 lg:px-6 py-3 text-center text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                    Verificar
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {transactions.map((transaction) => {
                            // Si es vendedor y la transacción fue rechazada por admin o desmarcada como pagada, mostrar con color distinto
                            const isRejectedByAdmin = transaction.paymentRejectedByAdmin === true;
                            const isUnmarked = transaction.status === 'rechazado' && !transaction.isPaidByVendor && transaction.paidByVendorAt === null && !isRejectedByAdmin;
                            return (
                            <tr key={transaction.id} className={`transition-colors ${selectedTransactions.includes(transaction.id) ? 'bg-blue-50' : ''} ${isRejectedByAdmin ? 'bg-red-100 border-l-4 border-red-500 hover:bg-red-200' : isUnmarked ? 'bg-orange-50 border-l-4 border-orange-400 hover:bg-orange-100' : 'hover:bg-gray-50'}`}>
                                {showSelection && (
                                    <td className="px-4 lg:px-6 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedTransactions.includes(transaction.id)}
                                            onChange={() => onSelectTransaction && onSelectTransaction(transaction.id)}
                                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                    </td>
                                )}
                                <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-xs md:text-sm font-medium text-gray-900">
                                    #{transaction.id}
                                </td>
                                <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-700">
                                    {transaction.clientPresencial?.name || transaction.clientApp?.name || 'N/A'}
                                </td>
                                <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-700">
                                    {transaction.beneficiaryFullName}
                                </td>
                                <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-xs md:text-sm font-semibold text-green-600">
                                    {formatCurrency(transaction.amountCOP)}
                                </td>
                                <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-xs md:text-sm text-gray-500">
                                    {formatDate(transaction.createdAt)}
                                </td>
                                <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <Badge status={transaction.status} />
                                        {isRejectedByAdmin && (
                                            <span className="px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded-full shadow-sm" title="El administrador ha rechazado este pago">
                                                ❌ Rechazado por Admin
                                            </span>
                                        )}
                                        {isUnmarked && (
                                            <span className="px-2 py-1 text-xs font-semibold bg-orange-200 text-orange-800 rounded-full" title="Esta transacción fue desmarcada como pagada">
                                                ⚠️ Desmarcada
                                            </span>
                                        )}
                                    </div>
                                </td>
                                {showVendorPaymentMethod && (
                                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                                        {transaction.isPaidByVendor && transaction.vendorPaymentMethod ? (
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                transaction.vendorPaymentMethod === 'efectivo'
                                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                    : transaction.vendorPaymentMethod === 'consignacion_nequi'
                                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                                    : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                            }`}>
                                                {transaction.vendorPaymentMethod === 'efectivo'
                                                    ? 'Efectivo'
                                                    : transaction.vendorPaymentMethod === 'consignacion_nequi'
                                                    ? 'Nequi'
                                                    : 'Bancolombia'}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 text-xs">-</span>
                                        )}
                                    </td>
                                )}
                                {transactions.some(tx => tx.isPaidByVendor && tx.vendorPaymentProofUrl) && (
                                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-center">
                                        {transaction.isPaidByVendor && transaction.vendorPaymentProofUrl ? (
                                            <a
                                                href={transaction.vendorPaymentProofUrl}
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
                                )}
                                {showPaymentActions && transaction.isPaidByVendor && (
                                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-center space-x-2">
                                        {!transaction.adminVerifiedPayment ? (
                                            <>
                                                <button
                                                    onClick={() => onEditPayment && onEditPayment(transaction)}
                                                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                                                    title="Editar pago"
                                                >
                                                    <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => onUnmarkPaid && onUnmarkPaid(transaction.id)}
                                                    className="text-red-600 hover:text-red-800 text-xs font-medium"
                                                    title="Desmarcar como pagado"
                                                >
                                                    <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </>
                                        ) : (
                                            <div className="flex items-center justify-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                </svg>
                                                Bloqueado
                                            </div>
                                        )}
                                    </td>
                                )}
                                {showUnmarkButton && transaction.isPaidByVendor && (
                                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-center">
                                        <button
                                            onClick={() => onUnmarkPaid && onUnmarkPaid(transaction.id)}
                                            className="text-red-600 hover:text-red-800 text-xs font-medium p-2 hover:bg-red-50 rounded-full transition-colors"
                                            title="Revertir pago (volver a pendiente)"
                                        >
                                            <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </td>
                                )}
                                {showVerifyButton && transaction.isPaidByVendor && (
                                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-center">
                                        {transaction.adminVerifiedPayment ? (
                                            <div className="flex items-center justify-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Verificado
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => onVerifyPayment && onVerifyPayment(transaction.id)}
                                                className="text-green-600 hover:text-green-800 text-xs font-medium p-2 hover:bg-green-50 rounded-full transition-colors"
                                                title="Marcar pago como verificado"
                                            >
                                                <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden p-4 space-y-3">
                {showSelection && onSelectAll && transactions.length > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 mb-2">
                        <input
                            type="checkbox"
                            checked={selectedTransactions.length === transactions.length && transactions.length > 0}
                            onChange={onSelectAll}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label className="text-sm font-medium text-gray-700 cursor-pointer flex-1" onClick={onSelectAll}>
                            Seleccionar todas ({transactions.length})
                        </label>
                    </div>
                )}
                {transactions.map(tx => {
                    // Si es vendedor y la transacción fue rechazada por admin o desmarcada como pagada, mostrar con color distinto
                    const isRejectedByAdmin = tx.paymentRejectedByAdmin === true;
                    const isUnmarked = tx.status === 'rechazado' && !tx.isPaidByVendor && tx.paidByVendorAt === null && !isRejectedByAdmin;
                    return (
                    <div key={tx.id} className={`p-4 rounded-xl shadow-sm border ${selectedTransactions.includes(tx.id) ? 'border-blue-500 bg-blue-50' : isRejectedByAdmin ? 'bg-red-100 border-red-500 border-l-4 shadow-md' : isUnmarked ? 'bg-orange-50 border-orange-400 border-l-4' : 'bg-white border-gray-100'}`}>
                        <div className="flex items-start gap-3 mb-3">
                            {showSelection && (
                                <input
                                    type="checkbox"
                                    checked={selectedTransactions.includes(tx.id)}
                                    onChange={() => onSelectTransaction && onSelectTransaction(tx.id)}
                                    className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                                />
                            )}
                            <div className="flex-1 min-w-0 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-medium text-gray-500">ID: <span className="text-gray-900">#{tx.id}</span></div>
                                    <div className="flex items-center gap-2">
                                        <Badge status={tx.status} />
                                        {isRejectedByAdmin && (
                                            <span className="px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded-full shadow-sm" title="El administrador ha rechazado este pago">
                                                ❌ Rechazado por Admin
                                            </span>
                                        )}
                                        {isUnmarked && (
                                            <span className="px-2 py-1 text-xs font-semibold bg-orange-200 text-orange-800 rounded-full" title="Esta transacción fue desmarcada como pagada">
                                                ⚠️ Desmarcada
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs text-gray-500 mb-0.5">Cliente</div>
                                    <div className="text-sm font-medium text-gray-900 truncate">{tx.clientPresencial?.name || tx.clientApp?.name || 'N/A'}</div>
                                </div>

                                <div>
                                    <div className="text-xs text-gray-500 mb-0.5">Destinatario</div>
                                    <div className="text-sm font-medium text-gray-900 truncate">{tx.beneficiaryFullName}</div>
                                </div>

                                <div>
                                    <div className="text-xs text-gray-500 mb-0.5">Monto COP</div>
                                    <div className="text-base font-semibold text-green-600">{formatCurrency(tx.amountCOP)}</div>
                                </div>

                                <div>
                                    <div className="text-xs text-gray-500 mb-0.5">Fecha</div>
                                    <div className="text-sm text-gray-700">{formatDate(tx.createdAt)}</div>
                                </div>

                                {showVendorPaymentMethod && tx.isPaidByVendor && tx.vendorPaymentMethod && (
                                    <div>
                                        <div className="text-xs text-gray-500 mb-0.5">Método de Pago</div>
                                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                                            tx.vendorPaymentMethod === 'efectivo'
                                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                : tx.vendorPaymentMethod === 'consignacion_nequi'
                                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                        }`}>
                                            {tx.vendorPaymentMethod === 'efectivo'
                                                ? 'Efectivo'
                                                : tx.vendorPaymentMethod === 'consignacion_nequi'
                                                ? 'Nequi'
                                                : 'Bancolombia'}
                                        </span>
                                    </div>
                                )}

                                {tx.isPaidByVendor && tx.vendorPaymentProofUrl && (
                                    <div>
                                        <div className="text-xs text-gray-500 mb-0.5">Comprobante</div>
                                        <a
                                            href={tx.vendorPaymentProofUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center gap-1"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            Ver comprobante
                                        </a>
                                    </div>
                                )}

                                {showPaymentActions && tx.isPaidByVendor && (
                                    <div className="flex gap-2 mt-3">
                                        {!tx.adminVerifiedPayment ? (
                                            <>
                                                <button
                                                    onClick={() => onEditPayment && onEditPayment(tx)}
                                                    className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200"
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    onClick={() => onUnmarkPaid && onUnmarkPaid(tx.id)}
                                                    className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200"
                                                >
                                                    Desmarcar
                                                </button>
                                            </>
                                        ) : (
                                            <div className="flex-1 px-3 py-2 bg-gray-100 text-gray-500 rounded text-xs font-medium text-center flex items-center justify-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                </svg>
                                                Bloqueado por admin
                                            </div>
                                        )}
                                    </div>
                                )}
                                {showUnmarkButton && tx.isPaidByVendor && (
                                    <div className="flex justify-center mt-3">
                                        <button
                                            onClick={() => onUnmarkPaid && onUnmarkPaid(tx.id)}
                                            className="px-3 py-2 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 flex items-center gap-1"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Revertir pago
                                        </button>
                                    </div>
                                )}
                                {showVerifyButton && tx.isPaidByVendor && (
                                    <div className="flex justify-center mt-3">
                                        {tx.adminVerifiedPayment ? (
                                            <div className="px-3 py-2 bg-green-100 text-green-700 rounded text-xs font-medium flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Verificado
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => onVerifyPayment && onVerifyPayment(tx.id)}
                                                className="px-3 py-2 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 flex items-center gap-1"
                                                title="Marcar pago como verificado"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Verificar
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    );
                })}
            </div>

            {/* Pagination */}
            {pagination.lastPage > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 sm:px-6">
                    <div className="flex flex-1 justify-between sm:hidden">
                        <button
                            onClick={() => onPageChange(pagination.page - 1)}
                            disabled={pagination.page === 1}
                            className="relative inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                            aria-label="Página anterior"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <button
                            onClick={() => onPageChange(pagination.page + 1)}
                            disabled={pagination.page === pagination.lastPage}
                            className="relative ml-3 inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
                            aria-label="Página siguiente"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                    <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm text-gray-700">
                                Mostrando página <span className="font-medium">{pagination.page}</span> de{' '}
                                <span className="font-medium">{pagination.lastPage}</span> ({pagination.total} resultados)
                            </p>
                        </div>
                        <div>
                            <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                                <button
                                    onClick={() => onPageChange(pagination.page - 1)}
                                    disabled={pagination.page === 1}
                                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:bg-gray-100"
                                >
                                    <span className="sr-only">Anterior</span>
                                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                                {(() => {
                                    const maxVisible = 3;
                                    const halfVisible = Math.floor(maxVisible / 2);
                                    let startPage = Math.max(1, pagination.page - halfVisible);
                                    let endPage = Math.min(pagination.lastPage, startPage + maxVisible - 1);
                                    
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
                                    if (endPage < pagination.lastPage) {
                                        if (endPage < pagination.lastPage - 1) pages.push('...');
                                        pages.push(pagination.lastPage);
                                    }
                                    
                                    return pages.map((page, idx) => (
                                        page === '...' ? (
                                            <span key={`ellipsis-${idx}`} className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">...</span>
                                        ) : (
                                            <button
                                                key={page}
                                                onClick={() => onPageChange(page as number)}
                                                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 ${
                                                    pagination.page === page
                                                        ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                                        : 'text-gray-900'
                                                }`}
                                            >
                                                {page}
                                            </button>
                                        )
                                    ));
                                })()}
                                <button
                                    onClick={() => onPageChange(pagination.page + 1)}
                                    disabled={pagination.page === pagination.lastPage}
                                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:bg-gray-100"
                                >
                                    <span className="sr-only">Siguiente</span>
                                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </nav>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
