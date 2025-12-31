'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import { transactionsService } from '@/services/transactions.service';
import { getLocalDateString, getDateDaysAgo, getFirstDayOfMonth } from '@/utils/date';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Cell
} from 'recharts';

interface ReportData {
    summary: {
        totalTransactions: number;
        completedCount: number;
        rejectedCount: number;
        cancelledCount: number;
        pendingCount: number;
        totalCOP: number;
        totalBs: number;
        averageRate: number;
    };
    chartData: Array<{
        date: string;
        cop: number;
        bs: number;
        count: number;
    }>;
    dateRange: {
        from: string;
        to: string;
    };
}

interface AdminColombiaFinancialSummary {
    global: {
        totalCommission: number;
        commissionPaid: number;
        commissionPending: number;
        adminColombiaEarnings: number;
        amountOwedToVenezuela: number;
    };
    byVendor: Array<{
        vendorId: number;
        vendorName: string;
        totalCommission: number;
        commissionPaid: number;
        commissionPending: number;
        adminColombiaEarnings: number;
        amountOwedToVenezuela: number;
    }>;
    dateRange: { from: string; to: string };
}

interface MonthlyStats {
    name: string;
    amountCOP: number;
    amountBs: number;
    earnings: number;
    count: number;
}

export default function ReportsPage() {
    const { user, loading: authLoading } = useAuth();
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState(() => getLocalDateString());
    const [endDate, setEndDate] = useState(() => getLocalDateString());
    const [adminSummary, setAdminSummary] = useState<AdminColombiaFinancialSummary | null>(null);
    const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
    const [loadingMonthly, setLoadingMonthly] = useState(true);

    useEffect(() => {
        if (!authLoading && user && startDate && endDate) {
            loadReports();
        }
    }, [startDate, endDate, user, authLoading]);

    useEffect(() => {
        if (!authLoading && user) {
            loadMonthlyStats();
        }
    }, [user, authLoading]);

    const loadMonthlyStats = async () => {
        try {
            setLoadingMonthly(true);
            const stats = await transactionsService.getMonthlyStats();
            setMonthlyStats(stats);
        } catch (error) {
            console.error('Error loading monthly stats:', error);
        } finally {
            setLoadingMonthly(false);
        }
    };

    const loadReports = async () => {
        try {
            setLoading(true);
            let data;
            if (user?.role === 'admin_colombia') {
                data = await transactionsService.getReportsAdminColombia(startDate, endDate);
                const summary = await transactionsService.getAdminColombiaFinancialSummary(startDate, endDate);
                setAdminSummary(summary);
            } else {
                data = await transactionsService.getReports(startDate, endDate);
                setAdminSummary(null);
            }
            setReportData(data);
        } catch (error) {
            console.error('Error loading reports:', error);
        } finally {
            setLoading(false);
        }
    };

    const downloadCSV = async () => {
        try {
            let transactions;
            if (user?.role === 'admin_colombia') {
                transactions = await transactionsService.getReportsAdminColombiaCSV(startDate, endDate);
            } else {
                transactions = await transactionsService.getReportsCSV(startDate, endDate);
            }

            // Group by vendor
            const byVendor: { [key: string]: any[] } = {};
            transactions.forEach((t: any) => {
                const vendorName = t.createdBy.name;
                if (!byVendor[vendorName]) {
                    byVendor[vendorName] = [];
                }
                byVendor[vendorName].push(t);
            });

            // Generate CSV with semicolon separator for Excel
            let csv = '';
            let totalCOP = 0;
            let totalBs = 0;

            // For each vendor
            Object.entries(byVendor).forEach(([vendor, txs]) => {
                csv += `Vendedor ${vendor}:\n`;
                csv += 'Fecha;Vendedor;Nombre Destinatario;Tasa Aplicada;Monto COP;Monto Bs\n';

                txs.forEach((t: any) => {
                    const fecha = new Date(t.createdAt).toLocaleDateString('es-CO');
                    const rate = t.saleRate || t.rateUsed || '-';
                    csv += `${fecha};${vendor};${t.beneficiaryFullName};${rate};${t.amountCOP};${t.amountBs}\n`;
                    totalCOP += Number(t.amountCOP);
                    totalBs += Number(t.amountBs);
                });

                csv += '\n';
            });

            // Totals
            csv += 'TOTALES:\n';
            csv += 'Total COP;Total Bs\n';
            csv += `${totalCOP};${totalBs}\n`;

            // Download
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `reporte_transacciones_${startDate}_${endDate}.csv`;
            link.click();
        } catch (error) {
            console.error('Error downloading CSV:', error);
        }
    };

    const formatCurrency = (amount: number, currency: 'COP' | 'Bs') => {
        if (currency === 'COP') {
            return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
        }
        return `${amount.toFixed(2)} Bs`;
    };

    const getMaxValue = (data: ReportData['chartData'], key: 'cop' | 'bs' | 'count') => {
        return Math.max(...data.map(d => d[key]), 1);
    };

    if (user?.role !== 'admin_venezuela' && user?.role !== 'admin_colombia') {
        return (
            <div className="p-4 sm:p-8">
                <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-red-800 mb-2">Acceso Denegado</h2>
                    <p className="text-red-600">Esta sección solo está disponible para administradores.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Reportes y Estadísticas</h1>
                <p className="text-gray-600">Visualiza métricas y rendimiento del sistema.</p>
            </div>

            {/* Monthly Performance Chart - Independent of daily filters */}
            <Card className="p-6 overflow-hidden">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Rendimiento Mensual {new Date().getFullYear()}</h3>
                        <p className="text-sm text-gray-500">Cifras globales acumuladas por mes</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                            <span className="text-xs font-medium text-gray-600">Pesos (COP)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                            <span className="text-xs font-medium text-gray-600">Bolívares (Bs)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                            <span className="text-xs font-medium text-gray-600">Ganancias</span>
                        </div>
                    </div>
                </div>

                <div className="h-[400px] w-full mt-4">
                    {loadingMonthly ? (
                        <div className="h-full w-full flex items-center justify-center bg-gray-50/50 rounded-xl">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={monthlyStats}
                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                barGap={8}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 500 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6B7280', fontSize: 12 }}
                                    tickFormatter={(value) => value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                                />
                                <Tooltip
                                    cursor={{ fill: '#F3F4F6', radius: 8 }}
                                    content={({ active, payload, label }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-white p-4 rounded-xl shadow-2xl border border-gray-100 min-w-[220px]">
                                                    <p className="text-sm font-bold text-gray-900 mb-3 border-b pb-2">{label} {new Date().getFullYear()}</p>
                                                    <div className="space-y-2.5">
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-gray-500">Volumen COP:</span>
                                                            <span className="font-bold text-blue-600">{formatCurrency(data.amountCOP, 'COP')}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-gray-500">Monto Bs:</span>
                                                            <span className="font-bold text-emerald-600">{formatCurrency(data.amountBs, 'Bs')}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-gray-500">Ganancia Admin:</span>
                                                            <span className="font-bold text-amber-600">{formatCurrency(data.earnings, 'COP')}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-sm pt-1 border-t">
                                                            <span className="text-gray-500">Transacciones:</span>
                                                            <span className="font-bold text-gray-900">{data.count}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar
                                    dataKey="amountCOP"
                                    fill="#3B82F6"
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={40}
                                    animationDuration={1500}
                                />
                                <Bar
                                    dataKey="amountBs"
                                    fill="#10B981"
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={40}
                                    animationDuration={1500}
                                />
                                <Bar
                                    dataKey="earnings"
                                    fill="#F59E0B"
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={40}
                                    animationDuration={1500}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </Card>

            {/* Date Filter */}
            <Card className="p-3 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Período de Análisis</h3>

                {/* Quick Filters */}
                <div className="mb-3 sm:mb-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Filtros Rápidos</p>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        <button
                            onClick={() => {
                                const today = getLocalDateString();
                                setStartDate(today);
                                setEndDate(today);
                            }}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
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
                    </div>

                    {user?.role === 'admin_colombia' && adminSummary && (
                        <>
                            {/* Resumen financiero Admin Colombia */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-none">
                                    <p className="text-amber-100 text-sm font-medium">Comisión total a vendedores (2%)</p>
                                    <p className="text-2xl font-bold mt-1">
                                        {formatCurrency(adminSummary.global.totalCommission, 'COP')}
                                    </p>
                                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/20 text-xs text-amber-50 font-medium">
                                        <span>Pagada: {formatCurrency(adminSummary.global.commissionPaid, 'COP')}</span>
                                        <span className="bg-white/20 px-1.5 py-0.5 rounded">Pendiente: {formatCurrency(adminSummary.global.commissionPending, 'COP')}</span>
                                    </div>
                                </Card>
                                <Card className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white border-none">
                                    <p className="text-teal-100 text-sm font-medium">Ganancia Admin Colombia</p>
                                    <p className="text-2xl font-bold mt-1">
                                        {formatCurrency(adminSummary.global.adminColombiaEarnings, 'COP')}
                                    </p>
                                    <p className="text-xs text-teal-50 mt-2 italic">* Calculado post-comisión</p>
                                </Card>
                                <Card className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white border-none">
                                    <p className="text-indigo-100 text-sm font-medium">Deuda con Admin Venezuela</p>
                                    <p className="text-2xl font-bold mt-1">
                                        {formatCurrency(adminSummary.global.amountOwedToVenezuela, 'COP')}
                                    </p>
                                    <p className="text-xs text-indigo-50 mt-2">Monto neto a transferir</p>
                                </Card>
                            </div>

                            {/* Detalle por vendedor */}
                            <Card className="mt-4">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen por Vendedor</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Comisión Total</th>
                                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Pagada</th>
                                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Pendiente</th>
                                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ganancia Admin CO</th>
                                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Debe a VE</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-100">
                                            {adminSummary.byVendor.map((v) => (
                                                <tr key={v.vendorId} className="hover:bg-gray-50">
                                                    <td className="px-4 py-2 text-gray-900 font-medium">{v.vendorName}</td>
                                                    <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(v.totalCommission, 'COP')}</td>
                                                    <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(v.commissionPaid, 'COP')}</td>
                                                    <td className="px-4 py-2 text-right text-amber-700 font-semibold">{formatCurrency(v.commissionPending, 'COP')}</td>
                                                    <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(v.adminColombiaEarnings, 'COP')}</td>
                                                    <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(v.amountOwedToVenezuela, 'COP')}</td>
                                                </tr>
                                            ))}
                                            {adminSummary.byVendor.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="px-4 py-4 text-center text-gray-500 text-sm">
                                                        No hay transacciones con tasa de compra en el período seleccionado.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </>
                    )}
                </div>

                {/* Custom Date Range */}
                <div className="border-t border-gray-200 pt-3 sm:pt-4">
                    <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Rango Personalizado</p>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                        <div className="flex-1">
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Fecha Inicio</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-3 py-2 sm:px-4 sm:py-2.5 text-sm border-2 border-gray-200 rounded-lg sm:rounded-xl focus:border-blue-500 focus:ring-2 sm:focus:ring-4 focus:ring-blue-100 transition-all"
                            />
                        </div>
                        <div className="flex-1">
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

                {/* Download CSV Button */}
                <div className="border-t border-gray-200 pt-3 sm:pt-4">
                    <button
                        onClick={downloadCSV}
                        disabled={loading || !reportData}
                        className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium text-sm transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Descargar CSV
                    </button>
                </div>
            </Card>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-600"></div>
                </div>
            ) : reportData ? (
                <>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
                            <p className="text-blue-100 text-sm font-medium mb-1">Total Transacciones</p>
                            <p className="text-4xl font-bold">{reportData.summary.totalTransactions}</p>
                        </Card>
                        <Card className="bg-gradient-to-br from-green-600 to-emerald-600 text-white">
                            <p className="text-green-100 text-sm font-medium mb-1">Completadas</p>
                            <p className="text-4xl font-bold">{reportData.summary.completedCount}</p>
                            <p className="text-green-200 text-sm mt-1">
                                {reportData.summary.totalTransactions > 0
                                    ? ((reportData.summary.completedCount / reportData.summary.totalTransactions) * 100).toFixed(1)
                                    : 0}% del total
                            </p>
                        </Card>
                        <Card className="bg-gradient-to-br from-red-600 to-rose-600 text-white">
                            <p className="text-red-100 text-sm font-medium mb-1">Rechazadas</p>
                            <p className="text-4xl font-bold">{reportData.summary.rejectedCount}</p>
                        </Card>
                        <Card className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white">
                            <p className="text-yellow-100 text-sm font-medium mb-1">Pendientes</p>
                            <p className="text-4xl font-bold">{reportData.summary.pendingCount}</p>
                        </Card>
                    </div>

                    {/* Financial Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Total Movido COP</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {formatCurrency(reportData.summary.totalCOP, 'COP')}
                                    </p>
                                </div>
                            </div>
                        </Card>
                        <Card>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Total Pagado Bs</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {formatCurrency(reportData.summary.totalBs, 'Bs')}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Chart - Simple Bar Chart */}
                    {reportData.chartData.length > 0 && (
                        <Card>
                            <h3 className="text-lg font-semibold text-gray-900 mb-6">Transacciones por Día</h3>
                            <div className="space-y-4">
                                {reportData.chartData.map((day) => (
                                    <div key={day.date} className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-600 font-medium">
                                                {new Date(day.date).toLocaleDateString('es-CO', { weekday: 'short', month: 'short', day: 'numeric' })}
                                            </span>
                                            <span className="text-gray-900 font-semibold">{day.count} transacciones</span>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-full transition-all duration-500"
                                                    style={{ width: `${(day.count / getMaxValue(reportData.chartData, 'count')) * 100}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-gray-500 w-24 text-right">
                                                {formatCurrency(day.cop, 'COP')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Daily Details Table */}
                    {reportData.chartData.length > 0 && (
                        <Card>
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Detalle por Día</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b-2 border-gray-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total COP</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Bs</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {reportData.chartData.map((day) => (
                                            <tr key={day.date} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                                    {new Date(day.date).toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                                </td>
                                                <td className="px-4 py-3 text-right text-sm text-gray-900">{day.count}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">
                                                    {formatCurrency(day.cop, 'COP')}
                                                </td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-blue-600">
                                                    {formatCurrency(day.bs, 'Bs')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-100 border-t-2 border-gray-200">
                                        <tr>
                                            <td className="px-4 py-3 text-sm font-bold text-gray-900">TOTAL</td>
                                            <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                                                {reportData.chartData.reduce((sum, d) => sum + d.count, 0)}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                                                {formatCurrency(reportData.summary.totalCOP, 'COP')}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-bold text-blue-600">
                                                {formatCurrency(reportData.summary.totalBs, 'Bs')}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </Card>
                    )}
                </>
            ) : (
                <div className="text-center py-12">
                    <p className="text-gray-500">No hay datos disponibles para el período seleccionado</p>
                </div>
            )}
        </div>
    );
}