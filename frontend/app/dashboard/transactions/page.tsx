'use client';
import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import SearchBar from '@/components/ui/SearchBar';
import Alert from '@/components/ui/Alert';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import { transactionsService } from '@/services/transactions.service';
import { Transaction } from '@/types/transaction';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getLocalDateString, getDateDaysAgo, getFirstDayOfMonth } from '@/utils/date';

export default function TransactionsPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const isAdminColombia = user?.role === 'admin_colombia';
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const itemsPerPage = 5;

    // Date filter states - default to today
    const [startDate, setStartDate] = useState<string>(getLocalDateString());
    const [endDate, setEndDate] = useState<string>(getLocalDateString());
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
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isResendModalOpen, setIsResendModalOpen] = useState(false);
    const [beneficiaryChanges, setBeneficiaryChanges] = useState<any>({});
    const [showBeneficiaryChangeWarning, setShowBeneficiaryChangeWarning] = useState(false);
    const [venezuelaProof, setVenezuelaProof] = useState<string | null>(null);
    const [loadingProof, setLoadingProof] = useState(false);

    // Load all transactions (up to 100 for stats)
    useEffect(() => {
        // Esperar a que termine la carga de autenticación y que user esté disponible
        if (authLoading || !user) return;

        loadTransactions();

        const intervalId = setInterval(() => {
            if (user) {
                loadTransactions();
            }
        }, 60_000);

        return () => clearInterval(intervalId);
    }, [user, startDate, endDate, authLoading]); // Recargar cuando cambie el usuario o las fechas

    const loadTransactions = async () => {
        try {
            // Si es admin_colombia, usar el endpoint específico que filtra solo sus vendedores
            let data: Transaction[];
            if (user?.role === 'admin_colombia') {
                // Usar el endpoint que filtra solo vendedores de admin_colombia
                data = await transactionsService.getHistoryAdminColombia('all', startDate || undefined, endDate || undefined);
            } else {
                data = await transactionsService.getTransactions(100, 0);
            }
            setTransactions(data);
            // Filters will be applied automatically via useEffect
        } catch (error) {
            console.error('Error loading transactions:', error);
        } finally {
            setLoading(false);
        }
    };

    // Apply all filters
    const applyFilters = useCallback(() => {
        let filtered = transactions;

        // Date filter - normalize dates to local timezone for comparison
        const filterByDate = (tx: Transaction): boolean => {
            if (!startDate && !endDate) return true;

            // Get transaction date in local timezone
            const txDate = new Date(tx.createdAt);
            // Get date string in local timezone (YYYY-MM-DD)
            const year = txDate.getFullYear();
            const month = String(txDate.getMonth() + 1).padStart(2, '0');
            const day = String(txDate.getDate()).padStart(2, '0');
            const txDateStr = `${year}-${month}-${day}`;

            if (startDate && endDate) {
                // Compare date strings directly
                return txDateStr >= startDate && txDateStr <= endDate;
            }
            if (startDate) {
                return txDateStr >= startDate;
            }
            if (endDate) {
                return txDateStr <= endDate;
            }
            return true;
        };

        filtered = filtered.filter(filterByDate);

        // Search filter
        if (searchQuery.trim()) {
            filtered = filtered.filter(
                (t) =>
                    t.beneficiaryFullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    t.beneficiaryBankName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    t.id.toString().includes(searchQuery)
            );
        }

        // Status filter
        if (selectedStatus !== 'all') {
            if (selectedStatus === 'pendiente') {
                // Include both 'pendiente' and 'pendiente_venezuela' when filtering by 'pendiente'
                filtered = filtered.filter((t) => t.status === 'pendiente' || t.status === 'pendiente_venezuela');
            } else {
                filtered = filtered.filter((t) => t.status === selectedStatus);
            }
        }

        setFilteredTransactions(filtered);
        setCurrentPage(1);
    }, [transactions, searchQuery, selectedStatus, startDate, endDate]);

    // Update filters when dependencies change
    useEffect(() => {
        applyFilters();
    }, [applyFilters]);

    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
    }, []);

    const handleStatusFilter = useCallback((status: string) => {
        setSelectedStatus(status);
    }, []);

    // Helper to determine if a transaction can be edited/cancelled (PENDIENTE within 5 minutes)
    const canEdit = (transaction: Transaction): boolean => {
        if (transaction.status !== 'pendiente') {
            return false;
        }
        const now = new Date();
        const reference = new Date(transaction.lastEditedAt || transaction.createdAt);
        const diffMinutes = (now.getTime() - reference.getTime()) / (1000 * 60);
        return diffMinutes < 5;
    };

    const handleViewDetails = async (transaction: Transaction) => {
        setSelectedTransaction(transaction);
        setVenezuelaProof(null);
        setIsDetailModalOpen(true);

        if (transaction.status === 'completado' && transaction.comprobanteVenezuela) {
            try {
                setLoadingProof(true);
                const proofs = await transactionsService.getTransactionProofs(transaction.id);
                if (proofs.comprobanteVenezuela) {
                    setVenezuelaProof(proofs.comprobanteVenezuela);
                }
            } catch (error) {
                console.error('Error loading proof:', error);
            } finally {
                setLoadingProof(false);
            }
        }
    };

    const handleEdit = (transaction: Transaction) => {
        if (!canEdit(transaction)) {
            setAlertState({
                isOpen: true,
                message: 'Esta transacción ya no puede ser editada. Solo se pueden editar transacciones en estado PENDIENTE dentro de los primeros 5 minutos.',
                variant: 'warning'
            });
            return;
        }
        router.push(`/dashboard/transactions/${transaction.id}/edit`);
    };

    const handleCancel = (transaction: Transaction) => {
        if (!canEdit(transaction)) {
            setAlertState({
                isOpen: true,
                message: 'Esta transacción ya no puede ser cancelada. Solo se pueden cancelar transacciones en estado PENDIENTE dentro de los primeros 5 minutos.',
                variant: 'warning'
            });
            return;
        }
        setConfirmState({
            isOpen: true,
            message: '¿Estás seguro de que deseas cancelar la transferencia? No podras desahacer esta acción.',
            onConfirm: async () => {
                try {
                    await transactionsService.cancelTransaction(transaction.id);
                    loadTransactions();
                    setConfirmState({ isOpen: false, message: '', onConfirm: () => { } });
                } catch (error) {
                    console.error('Error cancelando la transacción:', error);
                    setConfirmState({ isOpen: false, message: '', onConfirm: () => { } });
                    setAlertState({
                        isOpen: true,
                        message: 'No se pudo cancelar la transacción.',
                        variant: 'error'
                    });
                }
            }
        });
    };

    const handleResend = (transaction: Transaction) => {
        setSelectedTransaction(transaction);
        setBeneficiaryChanges({});
        setShowBeneficiaryChangeWarning(false);
        setIsResendModalOpen(true);
    };

    const handleResendConfirm = async (saveBeneficiaryChanges: boolean = false) => {
        if (!selectedTransaction) return;

        try {
            await transactionsService.resendRejectedTransaction(selectedTransaction.id, {
                ...beneficiaryChanges,
                saveBeneficiaryChanges,
            });
            setIsResendModalOpen(false);
            setShowBeneficiaryChangeWarning(false);
            loadTransactions();
            setAlertState({
                isOpen: true,
                message: 'Transacción reenviada exitosamente',
                variant: 'success'
            });
        } catch (error: any) {
            setAlertState({
                isOpen: true,
                message: error.response?.data?.message || 'Error al reenviar la transacción',
                variant: 'error'
            });
        }
    };

    const handleCopyToClipboard = (transactionToCopy: Transaction) => {
        const tx = transactionToCopy;
        const isPagoMovil = tx.beneficiaryIsPagoMovil;

        const formatCurr = (amount: number, currency: 'COP' | 'Bs') => {
            if (currency === 'COP') {
                return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
            }
            return `${amount.toFixed(2)} Bs`;
        };

        const amountCOP = formatCurr(Number(tx.amountCOP), 'COP');
        const amountBs = formatCurr(Number(tx.amountBs), 'Bs');
        const rate = tx.saleRate != null && !isNaN(parseFloat(tx.saleRate.toString()))
            ? parseFloat(tx.saleRate.toString()).toFixed(2)
            : (tx.rateUsed != null ? Number(tx.rateUsed).toFixed(2) : '-');
        const date = new Date(tx.createdAt).toLocaleString('es-CO');

        let text = `*DATOS DE TRANSFERENCIA*\n\n`;
        text += `Fecha: ${date}\n`;
        text += `Beneficiario: ${tx.beneficiaryFullName}\n`;
        text += `Cédula: ${tx.beneficiaryDocumentId}\n`;
        text += `Banco: ${tx.beneficiaryBankName}\n`;

        if (isPagoMovil) {
            text += `Teléfono (Pago Móvil): ${tx.beneficiaryPhone}\n`;
        } else {
            text += `Cuenta: ${tx.beneficiaryAccountNumber}\n`;
            if (tx.beneficiaryAccountType) {
                text += `Tipo: ${tx.beneficiaryAccountType}\n`;
            }
            if (tx.beneficiaryPhone) {
                text += `Teléfono: ${tx.beneficiaryPhone}\n`;
            }
        }

        text += `\nTasa: ${rate}\n`;
        text += `Monto COP: ${amountCOP}\n`;
        text += `Monto Bs: ${amountBs}`;

        navigator.clipboard.writeText(text).then(() => {
            setAlertState({
                isOpen: true,
                message: 'Datos copiados al portapapeles',
                variant: 'success'
            });

            setTimeout(() => setAlertState(prev => ({ ...prev, isOpen: false })), 2000);
        }).catch(err => {
            console.error('Error al copiar:', err);
            setAlertState({
                isOpen: true,
                message: 'Error al copiar datos',
                variant: 'error'
            });
        });
    };

    /**
     * Genera una imagen con el texto del comprobante incluido
     * Solución robusta que funciona en todos los dispositivos
     */
    const handleShareToWhatsApp = async () => {
        if (!selectedTransaction) return;

        setAlertState({
            isOpen: true,
            message: 'Generando comprobante para compartir...',
            variant: 'info'
        });

        try {
            // Crear un canvas para combinar imagen y texto
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                throw new Error('No se pudo crear el canvas');
            }

            // Texto del comprobante
            const textoComprobante = [
                '✅ TRANSFERENCIA COMPLETADA',
                '',
                `ID: #${selectedTransaction.id}`,
                `Destinatario: ${selectedTransaction.beneficiaryFullName}`,
                `Banco: ${selectedTransaction.beneficiaryBankName}`,
                `Cuenta: ${selectedTransaction.beneficiaryAccountNumber || selectedTransaction.beneficiaryPhone || '-'}`,
                `Monto: $${parseFloat(selectedTransaction.amountCOP.toString()).toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP`,
                `Monto Bs: ${parseFloat(selectedTransaction.amountBs.toString()).toFixed(2)} Bs`,
                `Tasa: ${selectedTransaction.saleRate != null && !isNaN(parseFloat(selectedTransaction.saleRate.toString())) ? parseFloat(selectedTransaction.saleRate.toString()).toFixed(2) : '-'} Bs/COP`,
                `Fecha: ${new Date(selectedTransaction.createdAt).toLocaleString('es-CO', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })}`,
                '',
                '¡Transferencia procesada exitosamente! ✨'
            ];

            let img: HTMLImageElement | null = null;
            let imgWidth = 0;
            let imgHeight = 0;

            // Si hay imagen, cargarla
            if (venezuelaProof) {
                img = new Image();
                img.crossOrigin = 'anonymous';

                await new Promise((resolve, reject) => {
                    img!.onload = resolve;
                    img!.onerror = reject;
                    img!.src = venezuelaProof as string;
                });

                imgWidth = img.width;
                imgHeight = img.height;
            }

            // Configurar dimensiones del canvas
            const padding = 40;
            const lineHeight = 35;
            const headerHeight = 80;
            const textAreaHeight = textoComprobante.length * lineHeight + padding * 2;

            canvas.width = Math.max(800, imgWidth);
            canvas.height = headerHeight + textAreaHeight + (img ? imgHeight + padding : 0);

            // Fondo blanco
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Header con gradiente
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, headerHeight);
            gradient.addColorStop(0, '#10b981');
            gradient.addColorStop(1, '#059669');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, headerHeight);

            // Título del header
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 32px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle'; // Keep this for vertical alignment
            ctx.fillText('Comprobante de Transferencia', canvas.width / 2, 50); // Changed Y coordinate as per instruction

            let currentY = headerHeight + padding;

            // Dibujar cada línea de texto
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic'; // Keep this for text lines

            textoComprobante.forEach((linea, index) => {
                if (linea === '') {
                    currentY += lineHeight / 2;
                    return;
                }

                if (index === 0) {
                    // Primera línea (título) - YA ESTÁ EN EL HEADER, PERO DEJAMOS ESTO COMO SUBTÍTULO O LO QUITAMOS
                    // El usuario lo incluyó en el array, así que lo renderizamos.
                    ctx.font = 'bold 28px Arial, sans-serif';
                    ctx.fillStyle = '#059669';
                } else if (linea.includes(':')) {
                    // Líneas con datos
                    const [label, value] = linea.split(':');
                    ctx.font = 'bold 22px Arial, sans-serif';
                    ctx.fillStyle = '#374151';
                    ctx.fillText(label + ':', padding, currentY);

                    ctx.font = '22px Arial, sans-serif';
                    ctx.fillStyle = '#1f2937';
                    const labelWidth = ctx.measureText(label + ': ').width;
                    // Ajustar posición del valor si es necesario, o solo concatenar
                    // El split corta en el primer ':', pero el valor podría tener ':' (ej: hora).
                    // Mejor usar .substring
                    const realValue = linea.substring(linea.indexOf(':') + 1);
                    ctx.fillText(realValue, padding + labelWidth, currentY);
                } else {
                    // Última línea (mensaje)
                    ctx.font = 'italic 20px Arial, sans-serif';
                    ctx.fillStyle = '#059669';
                    ctx.textAlign = 'center';
                    ctx.fillText(linea, canvas.width / 2, currentY);
                    ctx.textAlign = 'left';
                }

                currentY += lineHeight;
            });

            // Si hay imagen, dibujarla debajo del texto
            if (img) {
                currentY += padding / 2;

                // Calcular dimensiones para centrar la imagen
                const maxWidth = canvas.width - padding * 2;
                let drawWidth = imgWidth;
                let drawHeight = imgHeight;

                if (drawWidth > maxWidth) {
                    const scale = maxWidth / drawWidth;
                    drawWidth = maxWidth;
                    drawHeight = imgHeight * scale;
                }

                const xPos = (canvas.width - drawWidth) / 2;

                // Dibujar borde alrededor de la imagen
                ctx.strokeStyle = '#d1d5db';
                ctx.lineWidth = 2;
                ctx.strokeRect(xPos - 2, currentY - 2, drawWidth + 4, drawHeight + 4);

                // Dibujar la imagen
                ctx.drawImage(img, xPos, currentY, drawWidth, drawHeight);
            }

            // Convertir canvas a blob
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((b) => {
                    if (b) resolve(b);
                    else reject(new Error('Error al crear la imagen'));
                }, 'image/png', 0.95);
            });

            const archivo = new File([blob], `comprobante-${selectedTransaction.id}.png`, {
                type: 'image/png'
            });

            // Intentar compartir
            if (navigator.share) {
                try {
                    await navigator.share({
                        files: [archivo],
                        title: 'Comprobante de Transferencia',
                        text: `Comprobante de transferencia #${selectedTransaction.id}`
                    });

                    setIsDetailModalOpen(false);
                    setAlertState({
                        isOpen: true,
                        message: '¡Comprobante compartido exitosamente!',
                        variant: 'success'
                    });
                } catch (error: any) {
                    if (error.name === 'AbortError') {
                        setAlertState({
                            isOpen: true,
                            message: 'Compartir cancelado',
                            variant: 'info'
                        });
                        return;
                    }
                    // If native share fails for other reasons, try fallback to download
                    throw error;
                }
            } else {
                // Fallback: descargar la imagen
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `comprobante-${selectedTransaction.id}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                setAlertState({
                    isOpen: true,
                    message: 'Comprobante descargado. Compártelo desde tu galería.',
                    variant: 'success'
                });
            }
        } catch (error: any) {
            console.error('Error al compartir:', error);
            setAlertState({
                isOpen: true,
                message: 'Error al generar el comprobante. Intenta nuevamente.',
                variant: 'error'
            });
        }
    };

    const checkBeneficiaryChanges = () => {
        if (!selectedTransaction) return false;

        const hasChanges =
            (beneficiaryChanges.beneficiaryFullName && beneficiaryChanges.beneficiaryFullName !== selectedTransaction.beneficiaryFullName) ||
            (beneficiaryChanges.beneficiaryDocumentId && beneficiaryChanges.beneficiaryDocumentId !== selectedTransaction.beneficiaryDocumentId) ||
            (beneficiaryChanges.beneficiaryBankName && beneficiaryChanges.beneficiaryBankName !== selectedTransaction.beneficiaryBankName) ||
            (beneficiaryChanges.beneficiaryAccountNumber && beneficiaryChanges.beneficiaryAccountNumber !== selectedTransaction.beneficiaryAccountNumber) ||
            (beneficiaryChanges.beneficiaryAccountType && beneficiaryChanges.beneficiaryAccountType !== selectedTransaction.beneficiaryAccountType) ||
            (beneficiaryChanges.beneficiaryPhone && beneficiaryChanges.beneficiaryPhone !== selectedTransaction.beneficiaryPhone);

        return hasChanges;
    };

    const handleResendSubmit = () => {
        if (checkBeneficiaryChanges()) {
            setShowBeneficiaryChangeWarning(true);
        } else {
            handleResendConfirm(false);
        }
    };

    // Statistics derived from the filtered transaction list (by date)
    const getDateFilteredTransactions = () => {
        const filterByDate = (tx: Transaction): boolean => {
            if (!startDate && !endDate) return true;

            // Get transaction date in local timezone
            const txDate = new Date(tx.createdAt);
            // Get date string in local timezone (YYYY-MM-DD)
            const year = txDate.getFullYear();
            const month = String(txDate.getMonth() + 1).padStart(2, '0');
            const day = String(txDate.getDate()).padStart(2, '0');
            const txDateStr = `${year}-${month}-${day}`;

            if (startDate && endDate) {
                // Compare date strings directly
                return txDateStr >= startDate && txDateStr <= endDate;
            }
            if (startDate) {
                return txDateStr >= startDate;
            }
            if (endDate) {
                return txDateStr <= endDate;
            }
            return true;
        };
        return transactions.filter(filterByDate);
    };

    const dateFilteredTransactions = getDateFilteredTransactions();
    const stats = {
        total: dateFilteredTransactions.length,
        pendiente: dateFilteredTransactions.filter((t) => t.status === 'pendiente' || t.status === 'pendiente_venezuela').length,
        rechazado: dateFilteredTransactions.filter((t) => t.status === 'rechazado').length,
        completado: dateFilteredTransactions.filter((t) => t.status === 'completado').length,
    };

    // Pagination calculations
    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentTransactions = filteredTransactions.slice(startIndex, endIndex);

    return (
        <div className="p-4 sm:p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Historial de Transacciones</h1>
                <p className="text-gray-600">Consulta todas las transacciones realizadas</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6">
                <div onClick={() => handleStatusFilter('all')} className="cursor-pointer hover:shadow-lg active:scale-[0.98] transition-all touch-manipulation">
                    <Card className="p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="text-gray-600 text-xs sm:text-sm truncate">Total</p>
                                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total}</p>
                            </div>
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                        </div>
                    </Card>
                </div>
                <div onClick={() => handleStatusFilter('pendiente')} className="cursor-pointer hover:shadow-lg active:scale-[0.98] transition-all touch-manipulation">
                    <Card className="p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="text-gray-600 text-xs sm:text-sm truncate">Pendientes</p>
                                <p className="text-xl sm:text-2xl font-bold text-yellow-600">{stats.pendiente}</p>
                            </div>
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                    </Card>
                </div>
                <div onClick={() => handleStatusFilter('rechazado')} className="cursor-pointer hover:shadow-lg active:scale-[0.98] transition-all touch-manipulation">
                    <Card className="p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="text-gray-600 text-xs sm:text-sm truncate">Rechazadas</p>
                                <p className="text-xl sm:text-2xl font-bold text-red-600">{stats.rechazado}</p>
                            </div>
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>
                        </div>
                    </Card>
                </div>
                <div onClick={() => handleStatusFilter('completado')} className="cursor-pointer hover:shadow-lg active:scale-[0.98] transition-all touch-manipulation">
                    <Card className="p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="text-gray-600 text-xs sm:text-sm truncate">Completadas</p>
                                <p className="text-xl sm:text-2xl font-bold text-green-600">{stats.completado}</p>
                            </div>
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Search */}
            <div className="mb-4 sm:mb-6">
                <SearchBar placeholder="Buscar por Destinatario, banco o ID..." onSearch={handleSearch} />
            </div>

            {/* Date Filters */}
            <Card className="p-3 sm:p-4 mb-4 sm:mb-6">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">Filtros de Fecha</h3>

                {/* Quick Filters */}
                <div className="mb-3 sm:mb-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2">Filtros Rápidos</p>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        <button
                            onClick={() => {
                                const todayStr = getLocalDateString();
                                setStartDate(todayStr);
                                setEndDate(todayStr);
                            }}
                            className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${(() => {
                                const todayStr = getLocalDateString();
                                return startDate === todayStr && endDate === todayStr;
                            })()
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                }`}
                        >
                            Hoy
                        </button>
                        <button
                            onClick={() => {
                                const today = getLocalDateString();
                                const fifteenDaysAgo = getDateDaysAgo(15);
                                setStartDate(fifteenDaysAgo);
                                setEndDate(today);
                            }}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                        >
                            15 Días
                        </button>
                        <button
                            onClick={() => {
                                const today = getLocalDateString();
                                const firstDay = getFirstDayOfMonth();
                                setStartDate(firstDay);
                                setEndDate(today);
                            }}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                        >
                            Este Mes
                        </button>
                        <button
                            onClick={() => {
                                setStartDate('');
                                setEndDate('');
                            }}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            Todas las Fechas
                        </button>
                    </div>
                </div>

                {/* Custom Date Range */}
                <div className="border-t border-gray-200 pt-3 sm:pt-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2">Rango Personalizado</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                        <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Fecha Inicio</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-3 py-2 sm:px-4 sm:py-2.5 text-sm border-2 border-gray-200 rounded-lg sm:rounded-xl focus:border-blue-500 focus:ring-2 sm:focus:ring-4 focus:ring-blue-100 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Fecha Fin</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-3 py-2 sm:px-4 sm:py-2.5 text-sm border-2 border-gray-200 rounded-lg sm:rounded-xl focus:border-blue-500 focus:ring-2 sm:focus:ring-4 focus:ring-blue-100 transition-all"
                            />
                        </div>
                    </div>
                </div>
            </Card>

            {/* Transactions List */}
            <Card>
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mx-auto" />
                    </div>
                ) : filteredTransactions.length === 0 ? (
                    <div className="text-center py-12">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-gray-500 mb-4">No hay transacciones</p>
                        <Link href="/dashboard/transactions/new">
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Crear primera transacción</button>
                        </Link>
                    </div>
                ) : (
                    <>
                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b-2 border-gray-200">
                                    <tr>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase">ID</th>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase">Vendedor</th>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase">Destinatario</th>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase">Banco</th>
                                        <th className="px-4 lg:px-6 py-3 text-right text-xs md:text-sm font-medium text-gray-500 uppercase">Monto COP</th>
                                        <th className="px-4 lg:px-6 py-3 text-right text-xs md:text-sm font-medium text-gray-500 uppercase">Monto Bs</th>
                                        <th className="px-4 lg:px-6 py-3 text-center text-xs md:text-sm font-medium text-gray-500 uppercase">Tasa</th>
                                        <th className="px-4 lg:px-6 py-3 text-center text-xs md:text-sm font-medium text-gray-500 uppercase">Estado</th>
                                        <th className="px-4 lg:px-6 py-3 text-left text-xs md:text-sm font-medium text-gray-500 uppercase">Fecha</th>
                                        <th className="px-4 lg:px-6 py-3 text-right text-xs md:text-sm font-medium text-gray-500 uppercase">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {currentTransactions.map((transaction) => (
                                        <tr key={transaction.id} className="hover:bg-gray-50">
                                            <td className="px-4 lg:px-6 py-4 text-gray-900 font-medium text-sm">#{transaction.id}</td>
                                            <td className="px-4 lg:px-6 py-4 text-gray-600 font-medium text-sm">{transaction.createdBy?.name || 'Sistema'}</td>
                                            <td className="px-4 lg:px-6 py-4">
                                                <div className="font-medium text-gray-900 text-sm">{transaction.beneficiaryFullName}</div>
                                                <div className="text-xs text-gray-500">
                                                    {transaction.beneficiaryDocumentId && `${transaction.beneficiaryDocumentId}`}
                                                    {transaction.beneficiaryDocumentId && transaction.beneficiaryAccountNumber && ' · '}
                                                    {transaction.beneficiaryAccountNumber || (transaction.beneficiaryPhone && `📱 ${transaction.beneficiaryPhone}`)}
                                                </div>
                                            </td>
                                            <td className="px-4 lg:px-6 py-4 text-gray-600 text-sm">{transaction.beneficiaryBankName}</td>
                                            <td className="px-4 lg:px-6 py-4 text-right font-semibold text-gray-900 text-sm">
                                                {parseFloat(transaction.amountCOP.toString()).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                            </td>
                                            <td className="px-4 lg:px-6 py-4 text-right font-semibold text-gray-900 text-sm">
                                                {parseFloat(transaction.amountBs.toString()).toFixed(2)}
                                            </td>
                                            <td className="px-4 lg:px-6 py-4 text-center text-gray-600 text-sm">
                                                {transaction.saleRate != null && !isNaN(parseFloat(transaction.saleRate.toString()))
                                                    ? parseFloat(transaction.saleRate.toString()).toFixed(2)
                                                    : '-'}
                                            </td>
                                            <td className="px-4 lg:px-6 py-4 text-center">
                                                <Badge status={transaction.status} />
                                            </td>
                                            <td className="px-4 lg:px-6 py-4 text-gray-600 text-xs md:text-sm">
                                                {new Date(transaction.createdAt).toLocaleString('es-CO')}
                                            </td>
                                            <td className="px-4 lg:px-6 py-4">
                                                <div className="flex gap-2 justify-end items-center">
                                                    <button
                                                        onClick={() => handleViewDetails(transaction)}
                                                        className="p-2 bg-purple-100 hover:bg-purple-200 text-purple-700 hover:text-purple-900 rounded-lg transition-colors"
                                                        aria-label="Ver detalles"
                                                        title="Ver detalles"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleCopyToClipboard(transaction)}
                                                        className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-800 rounded-lg transition-colors"
                                                        aria-label="Copiar datos"
                                                        title="Copiar datos"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                                        </svg>
                                                    </button>
                                                    {canEdit(transaction) && !isAdminColombia && (
                                                        <>
                                                            <button
                                                                onClick={() => handleEdit(transaction)}
                                                                className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 hover:text-blue-900 rounded-lg transition-colors"
                                                                aria-label="Editar"
                                                                title="Editar"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => handleCancel(transaction)}
                                                                className="p-2 bg-red-100 hover:bg-red-200 text-red-700 hover:text-red-900 rounded-lg transition-colors"
                                                                aria-label="Eliminar"
                                                                title="Eliminar"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </>
                                                    )}
                                                    {transaction.status === 'rechazado' && !isAdminColombia && (
                                                        <button
                                                            onClick={() => handleResend(transaction)}
                                                            className="p-2 bg-green-100 hover:bg-green-200 text-green-700 hover:text-green-900 rounded-lg transition-colors"
                                                            aria-label="Reenviar"
                                                            title="Reenviar"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile list view */}
                        <div className="md:hidden space-y-3">
                            {currentTransactions.map((transaction) => (
                                <div key={transaction.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm text-gray-500">#{transaction.id} · {new Date(transaction.createdAt).toLocaleDateString('es-CO')}</div>
                                            <div className="font-medium text-gray-900 truncate">{transaction.beneficiaryFullName}</div>
                                            <div className="text-sm text-gray-600 truncate">{transaction.beneficiaryBankName}</div>
                                            <div className="text-xs text-gray-500 mt-1">Vendedor: {transaction.createdBy?.name || 'Sistema'}</div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className="text-lg font-bold text-gray-900">{parseFloat(transaction.amountCOP.toString()).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</div>
                                            <div className="text-sm text-gray-500">{parseFloat(transaction.amountBs.toString()).toFixed(2)} Bs</div>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between">
                                        <div><Badge status={transaction.status} /></div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleViewDetails(transaction)}
                                                className="p-2 bg-purple-100 hover:bg-purple-200 text-purple-700 hover:text-purple-900 rounded-lg transition-colors"
                                                aria-label="Ver detalles"
                                                title="Ver detalles"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleCopyToClipboard(transaction)}
                                                className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-800 rounded-lg transition-colors"
                                                aria-label="Copiar datos"
                                                title="Copiar datos"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                                </svg>
                                            </button>
                                            {canEdit(transaction) && !isAdminColombia && (
                                                <>
                                                    <button
                                                        onClick={() => handleEdit(transaction)}
                                                        className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 hover:text-blue-900 rounded-lg transition-colors"
                                                        aria-label="Editar"
                                                        title="Editar"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleCancel(transaction)}
                                                        className="p-2 bg-red-100 hover:bg-red-200 text-red-700 hover:text-red-900 rounded-lg transition-colors"
                                                        aria-label="Eliminar"
                                                        title="Eliminar"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </>
                                            )}
                                            {transaction.status === 'rechazado' && !isAdminColombia && (
                                                <button
                                                    onClick={() => handleResend(transaction)}
                                                    className="p-2 bg-green-100 hover:bg-green-200 text-green-700 hover:text-green-900 rounded-lg transition-colors"
                                                    aria-label="Reenviar"
                                                    title="Reenviar"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                                <div className="text-sm text-gray-600">
                                    Mostrando {startIndex + 1} a {Math.min(endIndex, filteredTransactions.length)} de {filteredTransactions.length} transacciones
                                </div>
                                <div className="flex gap-1 sm:gap-2 items-center">
                                    <button
                                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className={`px-2 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                        aria-label="Página anterior"
                                    >
                                        <svg className="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                        <span className="hidden sm:inline">Anterior</span>
                                    </button>
                                    <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto max-w-[calc(100vw-200px)] sm:max-w-none">
                                        {(() => {
                                            const maxVisible = 3; // Máximo de páginas visibles
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
                                                    <span key={`ellipsis-${idx}`} className="px-2 py-1 text-gray-500">...</span>
                                                ) : (
                                                    <button
                                                        key={page}
                                                        onClick={() => setCurrentPage(page as number)}
                                                        className={`px-2 sm:px-3 py-1 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${currentPage === page ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                                    >
                                                        {page}
                                                    </button>
                                                )
                                            ));
                                        })()}
                                    </div>
                                    <button
                                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className={`px-2 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center ${currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
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
                    </>
                )}
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
                title="Confirmar cancelación"
                message={confirmState.message}
                confirmText="Sí, cancelar"
                cancelText="No, mantener"
                variant="danger"
                onConfirm={confirmState.onConfirm}
                onCancel={() => setConfirmState({ isOpen: false, message: '', onConfirm: () => { } })}
            />

            {/* Transaction Detail Modal */}
            <Modal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                title="Detalles de la Transacción"
                size="lg"
            >
                {selectedTransaction && (
                    <div className="space-y-6">
                        {/* Header Info */}
                        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                            <div>
                                <p className="text-sm text-gray-500">ID de Transacción</p>
                                <p className="text-2xl font-bold text-gray-900">#{selectedTransaction.id}</p>
                            </div>
                            <Badge status={selectedTransaction.status} />
                        </div>

                        {/* Amounts Section */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                                <p className="text-xs text-green-600 font-medium mb-1">Monto en COP</p>
                                <p className="text-2xl font-bold text-green-900">
                                    ${parseFloat(selectedTransaction.amountCOP.toString()).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                </p>
                            </div>
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                <p className="text-xs text-blue-600 font-medium mb-1">Monto en Bs</p>
                                <p className="text-2xl font-bold text-blue-900">
                                    {parseFloat(selectedTransaction.amountBs.toString()).toFixed(2)} Bs
                                </p>
                            </div>
                        </div>

                        {/* Rate Info */}
                        <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                            <p className="text-xs text-purple-600 font-medium mb-1">Tasa Aplicada</p>
                            <p className="text-xl font-bold text-purple-900">
                                {selectedTransaction.saleRate != null && !isNaN(parseFloat(selectedTransaction.saleRate.toString()))
                                    ? parseFloat(selectedTransaction.saleRate.toString()).toFixed(2)
                                    : '-'}{' '}
                                Bs/COP
                            </p>
                        </div>

                        {/* Beneficiary Info */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900">Datos del Destinatario</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleCopyToClipboard(selectedTransaction)}
                                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                    >
                                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                        </svg>
                                        Copiar
                                    </button>
                                </div>
                            </div>
                            {selectedTransaction.beneficiaryIsPagoMovil && (
                                <span className="inline-block px-3 py-1 text-xs font-bold bg-blue-600 text-white rounded-full mt-2">
                                    📱 PAGO MÓVIL
                                </span>
                            )}

                            {selectedTransaction.beneficiaryIsPagoMovil ? (
                                // Layout para Pago Móvil
                                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-xs text-blue-600 font-medium mb-1">Nombre Completo</p>
                                            <p className="font-semibold text-gray-900">{selectedTransaction.beneficiaryFullName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-blue-600 font-medium mb-1">Cédula</p>
                                            <p className="font-semibold text-gray-900">{selectedTransaction.beneficiaryDocumentId}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-blue-600 font-medium mb-1">Banco</p>
                                            <p className="font-semibold text-gray-900">{selectedTransaction.beneficiaryBankName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-blue-600 font-medium mb-1">📱 Teléfono Pago Móvil</p>
                                            <p className="font-mono text-base font-bold text-blue-900">{selectedTransaction.beneficiaryPhone || '-'}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                // Layout para Transferencia Bancaria
                                <div className="p-4 bg-gray-50 rounded-xl space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-xs text-gray-500 mb-1">Nombre Completo</p>
                                            <p className="font-medium text-gray-900">{selectedTransaction.beneficiaryFullName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 mb-1">Cédula</p>
                                            <p className="font-medium text-gray-900">{selectedTransaction.beneficiaryDocumentId}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 mb-1">Banco</p>
                                            <p className="font-medium text-gray-900">{selectedTransaction.beneficiaryBankName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 mb-1">Número de Cuenta</p>
                                            <p className="font-mono text-sm text-gray-900">{selectedTransaction.beneficiaryAccountNumber || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 mb-1">Tipo de Cuenta</p>
                                            <p className="font-medium text-gray-900 capitalize">{selectedTransaction.beneficiaryAccountType || '-'}</p>
                                        </div>
                                        {selectedTransaction.beneficiaryPhone && (
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">Teléfono</p>
                                                <p className="font-medium text-gray-900">{selectedTransaction.beneficiaryPhone}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Vendor Info */}
                        <div className="space-y-3">
                            <h3 className="text-lg font-semibold text-gray-900">Vendedor</h3>
                            <div className="p-4 bg-gray-50 rounded-xl">
                                <p className="font-medium text-gray-900">
                                    {selectedTransaction.createdBy?.name || 'Sistema'}
                                </p>
                            </div>
                        </div>

                        {/* Client Info */}
                        {(selectedTransaction.clientPresencial || selectedTransaction.clientApp) && (
                            <div className="space-y-3">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">

                                    Cliente
                                </h3>
                                <div className="p-4 bg-gray-50 rounded-xl">
                                    <p className="font-medium text-gray-900">
                                        {selectedTransaction.clientPresencial?.name || selectedTransaction.clientApp?.name}
                                    </p>
                                    {selectedTransaction.clientPresencial?.phone && (
                                        <p className="text-sm text-gray-500 mt-1">
                                            {selectedTransaction.clientPresencial.phone}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Rejection Reason */}
                        {selectedTransaction.rejectionReason && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-red-700">Motivo del Rechazo</h3>
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-sm text-red-800 font-medium">{selectedTransaction.rejectionReason}</p>
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        {selectedTransaction.notes && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-gray-700">Notas Originales</h3>
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-sm text-gray-700">{selectedTransaction.notes}</p>
                                </div>
                            </div>
                        )}

                        {/* Comprobante Venezuela */}
                        {loadingProof ? (
                            <div className="p-4 bg-gray-50 rounded-xl text-center">
                                <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-600 mb-2"></div>
                                <p className="text-sm text-gray-500">Cargando comprobante...</p>
                            </div>
                        ) : venezuelaProof ? (
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-gray-700">Comprobante de Transferencia</h3>
                                <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex flex-col items-center">
                                    <img
                                        src={venezuelaProof}
                                        alt="Comprobante Venezuela"
                                        className="max-h-[400px] w-auto max-w-full object-contain rounded-lg border border-green-200 shadow-sm cursor-pointer hover:opacity-95 transition-opacity"
                                        onClick={() => window.open(venezuelaProof, '_blank')}
                                    />
                                    <p className="text-xs text-green-700 mt-2 text-center">
                                        Clic en la imagen para ver en tamaño completo
                                    </p>
                                </div>
                            </div>
                        ) : null}

                        {/* Timestamps */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-gray-200">
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Fecha de Creación</p>
                                <p className="text-sm font-medium text-gray-900">
                                    {new Date(selectedTransaction.createdAt).toLocaleString('es-CO', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </p>
                            </div>
                            {selectedTransaction.lastEditedAt && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Última Edición</p>
                                    <p className="text-sm font-medium text-gray-900">
                                        {new Date(selectedTransaction.lastEditedAt).toLocaleString('es-CO', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* WhatsApp Share Button - Only for completed transactions */}
                        {selectedTransaction.status === 'completado' && (
                            <div className="pt-4 border-t border-gray-200">
                                <button
                                    onClick={handleShareToWhatsApp}
                                    disabled={loadingProof}
                                    className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                    </svg>
                                    <span>Compartir en WhatsApp</span>
                                </button>
                                <p className="text-xs text-gray-500 text-center mt-2">
                                    Comparte el comprobante directamente en WhatsApp (solo móviles)
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Resend Rejected Transaction Modal */}
            <Modal
                isOpen={isResendModalOpen}
                onClose={() => setIsResendModalOpen(false)}
                title="Reenviar Transacción Rechazada"
                size="lg"
            >
                {selectedTransaction && (
                    <div className="space-y-4">
                        {/* Rejection Info - Highlighted */}
                        <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl">
                            <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 mt-0.5">
                                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-base font-bold text-red-900 mb-2">Motivo del Rechazo</h4>
                                    {selectedTransaction.rejectionReason ? (
                                        <p className="text-sm text-red-800 font-medium">{selectedTransaction.rejectionReason}</p>
                                    ) : (
                                        <p className="text-sm text-red-600 italic">No se especificó un motivo</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Rejection Image if exists */}
                        {selectedTransaction.comprobanteVenezuela && (
                            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                                <h4 className="text-sm font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Imagen Adjunta por el Administrador
                                </h4>
                                <div className="mt-3">
                                    <img
                                        src={selectedTransaction.comprobanteVenezuela}
                                        alt="Imagen del error"
                                        className="max-w-full h-auto rounded-lg border-2 border-yellow-300 shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => window.open(selectedTransaction.comprobanteVenezuela, '_blank')}
                                    />
                                    <p className="text-xs text-yellow-700 mt-2 italic">Haz clic en la imagen para verla en tamaño completo</p>
                                </div>
                            </div>
                        )}

                        {/* Transaction Info */}
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">Datos de la Transacción</h4>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-gray-500">ID:</p>
                                    <p className="font-medium">#{selectedTransaction.id}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Monto:</p>
                                    <p className="font-medium">${parseFloat(selectedTransaction.amountCOP.toString()).toLocaleString('es-CO')}</p>
                                </div>
                            </div>
                        </div>

                        {/* Beneficiary Info - Editable */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-900">Datos del Destinatario</h4>
                            <p className="text-xs text-gray-600">Revisa y corrige los datos del destinatario si es necesario</p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Nombre Completo</label>
                                    <input
                                        type="text"
                                        defaultValue={selectedTransaction.beneficiaryFullName}
                                        onChange={(e) => setBeneficiaryChanges({ ...beneficiaryChanges, beneficiaryFullName: e.target.value })}
                                        className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Documento</label>
                                    <input
                                        type="text"
                                        defaultValue={selectedTransaction.beneficiaryDocumentId}
                                        onChange={(e) => setBeneficiaryChanges({ ...beneficiaryChanges, beneficiaryDocumentId: e.target.value })}
                                        className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Banco</label>
                                    <input
                                        type="text"
                                        defaultValue={selectedTransaction.beneficiaryBankName}
                                        onChange={(e) => setBeneficiaryChanges({ ...beneficiaryChanges, beneficiaryBankName: e.target.value })}
                                        className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Número de Cuenta</label>
                                    <input
                                        type="text"
                                        defaultValue={selectedTransaction.beneficiaryAccountNumber}
                                        onChange={(e) => setBeneficiaryChanges({ ...beneficiaryChanges, beneficiaryAccountNumber: e.target.value })}
                                        className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Warning about beneficiary changes */}
                        {showBeneficiaryChangeWarning && (
                            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                                <h4 className="text-sm font-semibold text-yellow-900 mb-2">Se detectaron cambios en el destinatario</h4>
                                <p className="text-sm text-yellow-800 mb-3">
                                    ¿Deseas guardar estos cambios en el destinatario?
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => handleResendConfirm(true)}
                                        className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
                                    >
                                        Sí, guardar cambios
                                    </button>
                                    <button
                                        onClick={() => handleResendConfirm(false)}
                                        className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium"
                                    >
                                        No, solo reenviar
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        {!showBeneficiaryChangeWarning && (
                            <div className="flex gap-3 pt-4 border-t border-gray-200">
                                <button
                                    onClick={() => setIsResendModalOpen(false)}
                                    className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleResendSubmit}
                                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                                >
                                    Reenviar Transacción
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </Modal >
        </div >
    );
}
