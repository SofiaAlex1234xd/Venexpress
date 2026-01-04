'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { transactionsService } from '@/services/transactions.service';
import { getLocalDateString, getDateDaysAgo, getFirstDayOfMonth } from '@/utils/date';

interface VendorReports {
    totalTransactions: number;
    byStatus: {
        pendiente: number;
        pendiente_colombia: number;
        pendiente_venezuela: number;
        completado: number;
        rechazado: number;
        cancelado_vendedor: number;
        cancelado_administrador: number;
    };
    totalAmountCOP: number;
    totalAmountBs: number;
    completedAmountCOP: number;
    completedAmountBs: number;
    pendingAmountCOP: number;
    pendingAmountBs: number;
    rejectedAmountCOP: number;
    rejectedAmountBs: number;
    earnings: number;
    vendorEarningsTotal: number;
    vendorEarningsPaid: number;
    vendorEarningsPending: number;
    averageRate: number;
    commissionsDetail?: Array<{
        id: number;
        date: string;
        beneficiaryName: string;
        amountCOP: number;
        commissionRate: number;
        commissionAmount: number;
        isPaid: boolean;
        hasCustomRate: boolean;
    }>;
    transactionsByDay: Array<{
        date: string;
        count: number;
        amountCOP: number;
        amountBs: number;
        completed: number;
        pending: number;
        rejected: number;
    }>;
}

export default function VendorReportsPage() {
    const { user, loading: authLoading } = useAuth();
    const [reports, setReports] = useState<VendorReports | null>(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState<string>('today');
    const [customStartDate, setCustomStartDate] = useState<string>(() => getLocalDateString());
    const [customEndDate, setCustomEndDate] = useState<string>(() => getLocalDateString());
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Calcular fechas según el filtro (usando fechas locales)
    const getDateRange = () => {
        let startDate: string;
        let endDate: string;

        switch (dateFilter) {
            case 'today':
                const today = getLocalDateString();
                startDate = today;
                endDate = today;
                break;
            case '15days':
                startDate = getDateDaysAgo(15);
                endDate = getLocalDateString();
                break;
            case 'month':
                startDate = getFirstDayOfMonth();
                endDate = getLocalDateString();
                break;
            case 'custom':
                if (customStartDate && customEndDate) {
                    startDate = customStartDate;
                    endDate = customEndDate;
                } else {
                    // Default a hoy si no hay fechas personalizadas
                    const today = getLocalDateString();
                    startDate = today;
                    endDate = today;
                }
                break;
            default:
                const todayDefault = getLocalDateString();
                startDate = todayDefault;
                endDate = todayDefault;
        }

        return {
            startDate,
            endDate,
        };
    };

    const fetchReports = async () => {
        try {
            setLoading(true);
            const { startDate, endDate } = getDateRange();
            const data = await transactionsService.getVendorReports(startDate, endDate);
            setReports(data);
        } catch (error) {
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && user) {
            fetchReports();
            setCurrentPage(1); // Reset to first page when filter changes
        }
    }, [authLoading, user, dateFilter, customStartDate, customEndDate]);

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!reports) {
        return <div>No se pudieron cargar los reportes</div>;
    }

    return (
        <div className="space-y-6 p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Reportes</h1>
                    <p className="text-sm text-gray-600 mt-1">Análisis de tus transacciones</p>
                </div>
            </div>

            {/* Filtros de Fecha */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Período de Análisis</h3>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setDateFilter('today')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            dateFilter === 'today'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Hoy
                    </button>
                    <button
                        onClick={() => setDateFilter('15days')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            dateFilter === '15days'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        15 Días
                    </button>
                    <button
                        onClick={() => setDateFilter('month')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            dateFilter === 'month'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Este Mes
                    </button>
                    <button
                        onClick={() => setDateFilter('custom')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            dateFilter === 'custom'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Personalizado
                    </button>
                </div>

                {dateFilter === 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Fecha Inicio
                            </label>
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Fecha Final
                            </label>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Tarjetas de Estadísticas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Transacciones */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Total Transacciones</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">
                                {reports.totalTransactions}
                            </p>
                        </div>
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                        Completadas: {reports.byStatus.completado} | Pendientes: {reports.byStatus.pendiente_venezuela}
                    </div>
                </div>

                {/* Monto Total COP */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Total COP</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">
                                ${reports.totalAmountCOP.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </p>
                        </div>
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                        Completado: ${reports.completedAmountCOP.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                </div>

                {/* Monto Total Bs */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Total Bs</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">
                                {reports.totalAmountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                        Completado: {reports.completedAmountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                    </div>
                </div>

                {/* Tasa Promedio */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Tasa Promedio</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">
                                {reports.averageRate.toFixed(2)}
                            </p>
                        </div>
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                        Bs por COP
                    </div>
                </div>
            </div>

            {/* Ganancias del Vendedor */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl shadow-sm border border-emerald-200 p-5">
                    <h4 className="text-sm font-semibold text-emerald-800 mb-1">Ganancia Total Vendedor</h4>
                    <p className="text-xs text-emerald-700 mb-3">{user?.commission || 2}% de las transacciones COMPLETADAS</p>
                    <p className="text-2xl font-bold text-emerald-900">
                        ${reports.vendorEarningsTotal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-sm border border-blue-200 p-5">
                    <h4 className="text-sm font-semibold text-blue-800 mb-1">Pagado por Admin Colombia</h4>
                    <p className="text-xs text-blue-700 mb-3">Marcado como pagado (isPaidByVendor)</p>
                    <p className="text-2xl font-bold text-blue-900">
                        ${reports.vendorEarningsPaid.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl shadow-sm border border-amber-200 p-5">
                    <h4 className="text-sm font-semibold text-amber-800 mb-1">Pendiente de Pago</h4>
                    <p className="text-xs text-amber-700 mb-3">Lo que Admin Colombia aún te debe</p>
                    <p className="text-2xl font-bold text-amber-900">
                        ${reports.vendorEarningsPending.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                </div>
            </div>

            {/* Detalle de Comisiones por Transacción */}
            {reports.commissionsDetail && reports.commissionsDetail.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Detalle de Comisiones
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Beneficiario</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto COP</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Comisión %</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tu Comisión</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {reports.commissionsDetail.map((detail) => (
                                    <tr key={detail.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-900">#{detail.id}</td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {new Date(detail.date).toLocaleDateString('es-CO')}
                                        </td>
                                        <td className="px-4 py-3 text-gray-900">{detail.beneficiaryName}</td>
                                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                                            ${detail.amountCOP.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${
                                                detail.hasCustomRate 
                                                    ? 'bg-purple-100 text-purple-800' 
                                                    : 'bg-blue-100 text-blue-800'
                                            }`}>
                                                {detail.commissionRate}%
                                                {detail.hasCustomRate && ' ⚡'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-emerald-600">
                                            ${detail.commissionAmount.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {detail.isPaid ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    ✓ Pagado
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                    ⏳ Pendiente
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                                <tr>
                                    <td colSpan={5} className="px-4 py-3 text-sm font-bold text-gray-900">
                                        TOTAL
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-bold text-emerald-600">
                                        ${reports.vendorEarningsTotal.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                    </td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* Transacciones por Estado */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Transacciones por Estado</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                        <p className="text-sm font-medium text-green-700">Completadas</p>
                        <p className="text-2xl font-bold text-green-900 mt-1">{reports.byStatus.completado}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                        <p className="text-sm font-medium text-blue-700">Pendientes VE</p>
                        <p className="text-2xl font-bold text-blue-900 mt-1">{reports.byStatus.pendiente_venezuela}</p>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                        <p className="text-sm font-medium text-yellow-700">Pendientes CO</p>
                        <p className="text-2xl font-bold text-yellow-900 mt-1">{reports.byStatus.pendiente_colombia}</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                        <p className="text-sm font-medium text-red-700">Rechazadas</p>
                        <p className="text-2xl font-bold text-red-900 mt-1">{reports.byStatus.rechazado}</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                        <p className="text-sm font-medium text-gray-700">Canceladas</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                            {reports.byStatus.cancelado_vendedor + reports.byStatus.cancelado_administrador}
                        </p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
                        <p className="text-sm font-medium text-indigo-700">Pendientes</p>
                        <p className="text-2xl font-bold text-indigo-900 mt-1">{reports.byStatus.pendiente}</p>
                    </div>
                </div>
            </div>

            {/* Gráfico de Transacciones por Día */}
            {reports.transactionsByDay.length > 0 && (() => {
                // Paginación
                const totalPages = Math.ceil(reports.transactionsByDay.length / itemsPerPage);
                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const paginatedDays = reports.transactionsByDay.slice(startIndex, endIndex);

                return (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
                            <h3 className="text-lg font-semibold text-gray-900">Transacciones por Día</h3>
                            <div className="text-sm text-gray-600">
                                Mostrando {startIndex + 1} - {Math.min(endIndex, reports.transactionsByDay.length)} de {reports.transactionsByDay.length} días
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Fecha
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Total
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Completadas
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Pendientes
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Rechazadas
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Monto COP
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Monto Bs
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {paginatedDays.map((day) => {
                                        // Parse date string (YYYY-MM-DD) and create date in local timezone
                                        const [year, month, dayNum] = day.date.split('-').map(Number);
                                        const dateObj = new Date(year, month - 1, dayNum);
                                        
                                        return (
                                        <tr key={day.date} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {dateObj.toLocaleDateString('es-CO', {
                                                    weekday: 'short',
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric',
                                                })}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {day.count}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                                                {day.completed}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                                                {day.pending}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                                                {day.rejected}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                ${day.amountCOP.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {day.amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Paginación */}
                        {totalPages > 1 && (
                            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                                <div className="text-sm text-gray-700">
                                    Página {currentPage} de {totalPages}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="px-2 sm:px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                                        aria-label="Página anterior"
                                    >
                                        <svg className="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                        <span className="hidden sm:inline">Anterior</span>
                                    </button>
                                    <div className="flex gap-1 overflow-x-auto max-w-[calc(100vw-200px)] sm:max-w-none">
                                        {(() => {
                                            const maxVisible = 3;
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
                                                        className={`px-2 sm:px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                                                            currentPage === page
                                                                ? 'bg-blue-600 text-white'
                                                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
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
                                        className="px-2 sm:px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
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
                    </div>
                );
            })()}

            {/* Resumen de Montos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-sm border border-green-200 p-5">
                    <h4 className="text-sm font-semibold text-green-800 mb-3">Transacciones Completadas</h4>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-green-700">COP:</span>
                            <span className="text-lg font-bold text-green-900">
                                ${reports.completedAmountCOP.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-green-700">Bs:</span>
                            <span className="text-lg font-bold text-green-900">
                                {reports.completedAmountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-sm border border-blue-200 p-5">
                    <h4 className="text-sm font-semibold text-blue-800 mb-3">Transacciones Pendientes</h4>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-blue-700">COP:</span>
                            <span className="text-lg font-bold text-blue-900">
                                ${reports.pendingAmountCOP.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-blue-700">Bs:</span>
                            <span className="text-lg font-bold text-blue-900">
                                {reports.pendingAmountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl shadow-sm border border-red-200 p-5">
                    <h4 className="text-sm font-semibold text-red-800 mb-3">Transacciones Rechazadas</h4>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-red-700">COP:</span>
                            <span className="text-lg font-bold text-red-900">
                                ${reports.rejectedAmountCOP.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-red-700">Bs:</span>
                            <span className="text-lg font-bold text-red-900">
                                {reports.rejectedAmountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

