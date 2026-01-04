'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useEarningsPassword } from '@/hooks/useEarningsPassword';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ExchangeCalculator from '@/components/ExchangeCalculator';
import EarningsPasswordModal from '@/components/EarningsPasswordModal';
import { ratesService } from '@/services/rates.service';
import { transactionsService } from '@/services/transactions.service';
import { ExchangeRate } from '@/types/rate';
import { Transaction } from '@/types/transaction';
import { getLocalDateString } from '@/utils/date';

export default function DashboardPage() {
    const router = useRouter();
    const { user, loading } = useAuth();
    const earningsPassword = useEarningsPassword();
    const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);
    const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
    const [stats, setStats] = useState({ total: 0, pendientes: 0, rechazadas: 0, completadas: 0 });
    const [todayEarnings, setTodayEarnings] = useState<number | null>(null);
    const [loadingData, setLoadingData] = useState(true);
    const [showCalculator, setShowCalculator] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    useEffect(() => {
        if (user) {
            loadDashboardData();
        }
    }, [user]);

    // Actualizar solo la tasa cada minuto
    useEffect(() => {
        if (user) {
            const loadCurrentRate = async () => {
                try {
                    const rate = await ratesService.getCurrentRate();
                    setCurrentRate(rate);
                } catch (error) {
                    console.error('Error loading current rate:', error);
                }
            };

            // Cargar inmediatamente
            loadCurrentRate();

            // Actualizar cada minuto
            const rateIntervalId = setInterval(loadCurrentRate, 60_000);

            return () => clearInterval(rateIntervalId);
        }
    }, [user]);

    const loadDashboardData = async () => {
        try {
            const rate = await ratesService.getCurrentRate();
            setCurrentRate(rate);

            if (user?.role === 'admin_venezuela') {
                // Para admin_venezuela, cargar giros pendientes y ganancias de hoy
                const pendingTransfers = await transactionsService.getPendingVenezuela();
                const today = getLocalDateString();
                const reports = await transactionsService.getReports(today, today);
                const financialSummary = await transactionsService.getAdminVenezuelaFinancialSummary(today, today);

                setStats({
                    total: reports.summary.totalTransactions,
                    pendientes: pendingTransfers.length,
                    rechazadas: reports.summary.rejectedCount,
                    completadas: reports.summary.completedCount,
                });
                setTodayEarnings(financialSummary.totalEarnings);
                setRecentTransactions(pendingTransfers.slice(0, 3));
            } else if (user?.role === 'admin_colombia') {
                // Para admin_colombia, cargar datos consolidados de todos los vendedores y ganancias de hoy
                const pendingTransfers = await transactionsService.getPendingAdminColombia();
                const today = getLocalDateString();
                const reports = await transactionsService.getReportsAdminColombia(today, today);
                const financialSummary = await transactionsService.getAdminColombiaFinancialSummary(today, today);

                setStats({
                    total: reports.summary.totalTransactions,
                    pendientes: pendingTransfers.length,
                    rechazadas: reports.summary.rejectedCount,
                    completadas: reports.summary.completedCount,
                });
                setTodayEarnings(financialSummary.global.adminColombiaEarnings);
                setRecentTransactions(pendingTransfers.slice(0, 3));
            } else {
                // Para vendedores
                const today = getLocalDateString();
                const transactions = await transactionsService.getTransactions(100, 0, today, today);

                // Calcular ganancias de hoy con comisión dinámica (usando transactionCommission)
                const completedToday = transactions.filter(t => t.status === 'completado');
                const todayEarningsCalc = completedToday.reduce((sum, t) => {
                    const copValue = parseFloat(t.amountCOP?.toString() || '0');
                    // Usar la comisión específica de la transacción, fallback al commission del usuario
                    const commissionRate = (t.transactionCommission || user?.commission || 2) / 100;
                    return sum + (copValue * commissionRate);
                }, 0);

                const totalStats = {
                    total: transactions.length,
                    pendientes: transactions.filter(t => t.status === 'pendiente_venezuela' || t.status === 'pendiente').length,
                    rechazadas: transactions.filter(t => t.status === 'rechazado').length,
                    completadas: transactions.filter(t => t.status === 'completado').length,
                };
                setStats(totalStats);
                setTodayEarnings(todayEarningsCalc);
                setRecentTransactions(transactions.slice(0, 3));
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoadingData(false);
        }
    };

    if (loading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600"></div>
            </div>
        );
    }

    // Usar estado para las estadísticas en lugar de calcularlas en el renderizado
    // (necesitamos declarar el estado arriba)

    return (
        <div className="p-4 sm:p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    ¡Hola, {user.name}!
                </h1 >
                <p className="text-gray-600">
                    Bienvenido a tu panel de control
                </p>
            </div >

            {/* Exchange Rate Card & Earnings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {currentRate && (
                    <div
                        className="cursor-pointer hover:scale-[1.02] transition-transform"
                        onClick={() => setShowCalculator(true)}
                    >
                        <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white h-full">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-blue-100 text-sm mb-1">Tasa de cambio actual</p>
                                    <p className="text-4xl font-bold">
                                        {parseFloat(currentRate.saleRate.toString()).toFixed(2)}
                                    </p>
                                    <p className="text-blue-100 text-xs mt-2">
                                        Actualizada: {new Date(currentRate.createdAt).toLocaleString('es-CO')}
                                    </p>
                                    <p className="text-blue-200 text-xs mt-2 font-medium">
                                        Haz clic para usar la calculadora
                                    </p>
                                </div>
                                <svg className="w-20 h-20 opacity-50" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                                </svg>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Ganancias de Hoy - Para Admins y Vendedores */}
                {todayEarnings !== null && (
                    <>
                        {user?.role === 'admin_venezuela' && !earningsPassword.isAuthenticated ? (
                            <Card 
                                className="bg-gradient-to-r from-green-600 to-emerald-600 text-white h-full cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={earningsPassword.openAuthModal}
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-green-100 text-sm mb-1">Mis Ganancias Hoy</p>
                                        <p className="text-3xl font-bold mb-2">
                                            🔒 Protegido
                                        </p>
                                        <p className="text-green-100 text-xs mt-2">
                                            {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                        </p>
                                        <p className="text-green-200 text-xs mt-2 font-medium">
                                            Click para acceder
                                        </p>
                                    </div>
                                    <svg className="w-20 h-20 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                            </Card>
                        ) : (
                            <Card className="bg-gradient-to-r from-green-600 to-emerald-600 text-white h-full">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-green-100 text-sm mb-1">Mis Ganancias Hoy</p>
                                        <p className="text-4xl font-bold">
                                            ${todayEarnings.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-green-100 text-xs mt-2">
                                            {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                        </p>
                                        <p className="text-green-200 text-xs mt-2 font-medium">
                                            {user?.role === 'admin_colombia' 
                                                ? 'Admin Colombia' 
                                                : user?.role === 'admin_venezuela' 
                                                ? 'Admin Venezuela' 
                                                : 'Comisión (5%)'}
                                        </p>
                                    </div>
                                    <svg className="w-20 h-20 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                            </Card>
                        )}
                        <EarningsPasswordModal
                            isOpen={earningsPassword.showModal}
                            onClose={earningsPassword.closeAuthModal}
                            onAuthenticate={earningsPassword.authenticate}
                        />
                    </>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6 md:mb-8">
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

                <Card className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <p className="text-gray-600 text-xs sm:text-sm truncate">Pendientes</p>
                            <p className="text-xl sm:text-2xl font-bold text-yellow-600">{stats.pendientes}</p>
                        </div>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </Card>

                <Card className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <p className="text-gray-600 text-xs sm:text-sm truncate">Rechazadas</p>
                            <p className="text-xl sm:text-2xl font-bold text-red-600">{stats.rechazadas}</p>
                        </div>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 sm:w-6 sm:h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                    </div>
                </Card>

                <Card className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <p className="text-gray-600 text-xs sm:text-sm truncate">Completadas</p>
                            <p className="text-xl sm:text-2xl font-bold text-green-600">{stats.completadas}</p>
                        </div>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Content based on role */}
            {user?.role === 'admin_venezuela' || user?.role === 'admin_colombia' ? (
                <>
                    {/* Admin Venezuela / Colombia - Giros Pendientes */}
                    <Card>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-900">Giros Pendientes</h2>
                            <Link
                                href="/dashboard/pending-transfers"
                                className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
                            >
                                Ver todos →
                            </Link>
                        </div>

                        {loadingData ? (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
                            </div>
                        ) : recentTransactions.length === 0 ? (
                            <div className="text-center py-12">
                                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-gray-500 text-lg mb-2">¡Excelente trabajo!</p>
                                <p className="text-gray-400 text-sm">No hay giros pendientes por procesar</p>
                            </div>
                        ) : (
                            <div className="space-y-3 sm:space-y-4">
                                {recentTransactions.map((transaction) => (
                                    <div key={transaction.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 bg-yellow-50 border border-yellow-200 rounded-xl hover:bg-yellow-100 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-semibold text-gray-500">#{transaction.id}</span>
                                                <span className="text-xs text-gray-400">•</span>
                                                <span className="text-xs text-gray-500">{transaction.createdBy.name}</span>
                                            </div>
                                            <p className="font-medium text-gray-900 text-sm sm:text-base truncate">
                                                {transaction.beneficiaryFullName}
                                            </p>
                                            <p className="text-xs sm:text-sm text-gray-500 truncate">
                                                {transaction.beneficiaryBankName} • {transaction.beneficiaryAccountNumber}
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                                            <div className="text-left sm:text-right">
                                                <p className="font-bold text-gray-900 text-sm sm:text-base">
                                                    ${parseFloat(transaction.amountCOP.toString()).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                                </p>
                                                <p className="text-xs sm:text-sm text-blue-600 font-semibold">
                                                    {parseFloat(transaction.amountBs.toString()).toFixed(2)} Bs
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    {/* Admin Quick Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                        {user?.role === 'admin_colombia' && (
                            <>
                                <Link href="/dashboard/vendors">
                                    <Card className="hover:shadow-2xl transition-shadow cursor-pointer bg-gradient-to-br from-green-50 to-teal-50 border-2 border-green-200">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">Gestionar Vendedores</h3>
                                                <p className="text-sm text-gray-600">Ver deuda y crear vendedores</p>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>
                                <Link href="/dashboard/users-management">
                                    <Card className="hover:shadow-2xl transition-shadow cursor-pointer bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">Gestionar Usuarios</h3>
                                                <p className="text-sm text-gray-600">Cambiar roles y permisos</p>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>
                            </>
                        )}
                        {user?.role === 'admin_venezuela' && (
                            <>
                                <Link href="/dashboard/pending-transfers">
                                    <Card className="hover:shadow-2xl transition-shadow cursor-pointer bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-200">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-yellow-600 rounded-xl flex items-center justify-center">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">Ver Giros Pendientes</h3>
                                                <p className="text-sm text-gray-600">Procesar transferencias</p>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>

                                <Link href="/dashboard/reports">
                                    <Card className="hover:shadow-2xl transition-shadow cursor-pointer bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">Ver Gráficos</h3>
                                                <p className="text-sm text-gray-600">Reportes y estadísticas</p>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>
                            </>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {/* Vendedor - Transacciones Recientes */}
                    <Card>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-900">Transacciones Recientes</h2>
                            <Link
                                href="/dashboard/transactions"
                                className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
                            >
                                Ver todas →
                            </Link>
                        </div>

                        {loadingData ? (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
                            </div>
                        ) : recentTransactions.length === 0 ? (
                            <div className="text-center py-12">
                                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="text-gray-500 mb-4">No hay transacciones aún</p>
                                <Link
                                    href="/dashboard/transactions/new"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Crear primera transacción
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3 sm:space-y-4">
                                {recentTransactions.map((transaction) => (
                                    <div key={transaction.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 text-sm sm:text-base truncate">
                                                {transaction.beneficiaryFullName}
                                            </p>
                                            <p className="text-xs sm:text-sm text-gray-500 truncate">
                                                {transaction.beneficiaryBankName}
                                            </p>
                                            <p className="text-xs text-gray-400 sm:hidden truncate">
                                                {transaction.beneficiaryAccountNumber}
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                                            <div className="text-left sm:text-right">
                                                <p className="font-bold text-gray-900 text-sm sm:text-base">
                                                    ${parseFloat(transaction.amountCOP.toString()).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                                                </p>
                                                <p className="text-xs sm:text-sm text-gray-500">
                                                    {parseFloat(transaction.amountBs.toString()).toFixed(2)} Bs
                                                </p>
                                            </div>
                                            <div className="flex-shrink-0">
                                                <Badge status={transaction.status} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    {/* Vendedor Quick Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                        <Link href="/dashboard/transactions/new">
                            <Card className="hover:shadow-2xl transition-shadow cursor-pointer bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">Nueva Transacción</h3>
                                        <p className="text-sm text-gray-600">Crear un nuevo giro</p>
                                    </div>
                                </div>
                            </Card>
                        </Link>

                        <Link href="/dashboard/clients">
                            <Card className="hover:shadow-2xl transition-shadow cursor-pointer bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">Gestionar Clientes</h3>
                                        <p className="text-sm text-gray-600">Ver y agregar clientes</p>
                                    </div>
                                </div>
                            </Card>
                        </Link>
                    </div>
                </>
            )}

            {/* Exchange Calculator Modal */}
            {
                currentRate && (
                    <ExchangeCalculator
                        rate={parseFloat(currentRate.saleRate.toString())}
                        isOpen={showCalculator}
                        onClose={() => setShowCalculator(false)}
                    />
                )
            }
        </div >
    );
}
