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
}

export default function TransactionList({
    transactions,
    loading,
    pagination,
    onPageChange,
    showSelection = false,
    selectedTransactions = [],
    onSelectTransaction,
    onSelectAll
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
                            {showSelection && (
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
                            {transactions.some(tx => tx.isPaidByVendor && tx.vendorPaymentProofUrl) && (
                                <th className="px-4 lg:px-6 py-3 text-center text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
                                    Comprobante
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {transactions.map((transaction) => (
                            <tr key={transaction.id} className={`hover:bg-gray-50 transition-colors ${selectedTransactions.includes(transaction.id) ? 'bg-blue-50' : ''}`}>
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
                                    <Badge status={transaction.status} />
                                </td>
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
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden p-4 space-y-3">
                {showSelection && transactions.length > 0 && (
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
                {transactions.map(tx => (
                    <div key={tx.id} className={`bg-white p-4 rounded-xl shadow-sm border ${selectedTransactions.includes(tx.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
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
                                    <Badge status={tx.status} />
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
                            </div>
                        </div>
                    </div>
                ))}
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
