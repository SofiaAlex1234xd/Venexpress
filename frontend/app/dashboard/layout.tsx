'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import Logo from '@/components/ui/Logo';
import Button from '@/components/ui/Button';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, logout, loading } = useAuth();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600"></div>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    interface NavigationItem {
        name: string;
        href: string;
        icon: React.ReactNode;
        roles?: string[];
        isSecondary?: boolean;
        showOnlyForAdminColombiaVendors?: boolean; // Para items que solo deben mostrarse a vendedores de admin_colombia
    }

    const allNavigation: NavigationItem[] = [
        // --- Navegación común ---
        {
            name: 'Dashboard',
            href: '/dashboard',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                </svg>
            ),
        },
        {
            name: 'Tasa de Compra',
            href: '/dashboard/purchase-rates',
            roles: ['admin_venezuela'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Clientes',
            href: '/dashboard/clients',
            roles: ['admin_venezuela'],
            isSecondary: true,
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Destinatarios',
            href: '/dashboard/beneficiaries',
            roles: ['admin_venezuela'],
            isSecondary: true,
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                </svg>
            ),
        },
        {
            name: 'Pagos a Vendedores',
            href: '/dashboard/vendor-payments',
            roles: ['admin_venezuela'],
            isSecondary: true,
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Saldos',
            href: '/dashboard/accounts',
            roles: ['admin_venezuela'],
            isSecondary: true,
            icon: (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                </svg>
            ),
        },
        {
            name: 'Vendedores',
            href: '/dashboard/vendors',
            roles: ['admin_venezuela'],
            isSecondary: true,
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                </svg>
            ),
        },
        // --- Navegación de Vendedor ---
        {
            name: 'Clientes',
            href: '/dashboard/clients',
            roles: ['vendedor'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Destinatarios',
            href: '/dashboard/beneficiaries',
            roles: ['vendedor'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                </svg>
            ),
        },
        {
            name: 'Nueva Transacción',
            href: '/dashboard/transactions/new',
            roles: ['vendedor'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                    />
                </svg>
            ),
        },
        {
            name: 'Transacciones',
            href: '/dashboard/transactions',
            roles: ['vendedor', 'admin_colombia'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                </svg>
            ),
        },
        {
            name: 'Deuda',
            href: '/dashboard/debt',
            roles: ['vendedor'],
            showOnlyForAdminColombiaVendors: true, // Solo mostrar a vendedores de admin_colombia
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Reportes',
            href: '/dashboard/vendor-reports',
            roles: ['vendedor'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                </svg>
            ),
        },
        // --- Navegación de Admin Venezuela ---
        {
            name: 'Tasa de Venta',
            href: '/dashboard/rates',
            roles: ['admin_venezuela'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                    />
                </svg>
            ),
        },
        {
            name: 'Giros Pendientes',
            href: '/dashboard/pending-transfers',
            roles: ['admin_venezuela'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Historial',
            href: '/dashboard/transfer-history',
            roles: ['admin_venezuela'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                    />
                </svg>
            ),
        },
        {
            name: 'Ganancias y Deuda',
            href: '/dashboard/venezuela-earnings',
            roles: ['admin_venezuela'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Reportes',
            href: '/dashboard/reports',
            roles: ['admin_venezuela'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                </svg>
            ),
        },
        // --- Navegación de Admin Colombia (Principales) ---
        {
            name: 'Giros Pendientes',
            href: '/dashboard/pending-transfers',
            roles: ['admin_colombia'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Pagos a vendedores',
            href: '/dashboard/vendor-payments',
            roles: ['admin_colombia'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Deuda con Venezuela',
            href: '/dashboard/venezuela-debt',
            roles: ['admin_colombia'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Vendedores',
            href: '/dashboard/vendors',
            roles: ['admin_colombia'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                </svg>
            ),
        },
        
        {
            name: 'Reportes',
            href: '/dashboard/reports',
            roles: ['admin_colombia'],
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                </svg>
            ),
        },
        
        // --- Navegación de Admin Colombia (Secundarias - en "Otros") ---
        {
            name: 'Clientes',
            href: '/dashboard/clients',
            roles: ['admin_colombia'],
            isSecondary: true,
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Destinatarios',
            href: '/dashboard/beneficiaries',
            roles: ['admin_colombia'],
            isSecondary: true,
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                </svg>
            ),
        },
        {
            name: 'Gestión de Usuarios',
            href: '/dashboard/users-management',
            roles: ['admin_colombia'],
            isSecondary: true,
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                </svg>
            ),
        },
        {
            name: 'Tasa de Venta',
            href: '/dashboard/rates',
            roles: ['admin_colombia'],
            isSecondary: true,
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                    />
                </svg>
            ),
        },
    ];

    // Filtrar navegación según el rol del usuario
    const allFilteredNavigation = allNavigation.filter(item => {
        if (!item.roles) return true; // Si no tiene roles definidos, mostrar a todos
        
        // Verificar si el item tiene el rol requerido
        if (!item.roles.includes(user.role)) return false;
        
        // Si el item solo debe mostrarse a vendedores de admin_colombia
        if (item.showOnlyForAdminColombiaVendors) {
            // Solo mostrar si es vendedor Y (adminId es 1, null o undefined)
            if (user.role === 'vendedor') {
                const isAdminColombiaVendor = user.adminId === 1 || user.adminId === null || user.adminId === undefined;
                return isAdminColombiaVendor;
            }
            return false;
        }
        
        return true;
    });

    // Separar navegación principal y secundaria
    const primaryNavigation = allFilteredNavigation.filter(item => !item.isSecondary);
    const secondaryNavigation = allFilteredNavigation.filter(item => item.isSecondary);
    
    // Navegación a mostrar (solo primaria, las secundarias se muestran debajo cuando showMoreMenu está activo)
    const navigation = primaryNavigation;

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex flex-col md:flex-row">
            {/* Mobile top bar */}
            <header className="md:hidden bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-200 px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-40">
                <div className="flex items-center gap-2 sm:gap-3">
                    <button
                        aria-label="Abrir menú"
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation"
                    >
                        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    <div className="flex items-center">
                        <Logo size="sm" />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 hidden sm:inline truncate max-w-[120px]">{user.name}</span>
                </div>
            </header>

            {/* Sidebar (desktop) */}
            <aside className="hidden md:flex w-64 bg-white/80 backdrop-blur-sm shadow-xl border-r border-gray-100 flex-col flex-shrink-0">
                {/* Logo */}
                <div className="p-6 border-b border-gray-100">
                    <Logo size="md" />
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {navigation.map((item, index) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={`${item.href}-${index}`}
                                href={item.href}
                                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200
                  ${isActive
                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                                        : 'text-gray-700 hover:bg-gray-100'
                                    }
                `}
                            >
                                {item.icon}
                                <span>{item.name}</span>
                            </Link>
                        );
                    })}
                    
                    {/* Botón "Más opciones" */}
                    {secondaryNavigation.length > 0 && (
                        <button
                            onClick={() => setShowMoreMenu(!showMoreMenu)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 text-gray-700 hover:bg-gray-100"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showMoreMenu ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                            </svg>
                            <span>{showMoreMenu ? 'Menos opciones' : 'Más opciones'}</span>
                        </button>
                    )}
                    
                    {/* Opciones secundarias - aparecen debajo cuando showMoreMenu está activo */}
                    {showMoreMenu && secondaryNavigation.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-gray-200">
                            {secondaryNavigation.map((item, index) => {
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={`secondary-${item.href}-${index}`}
                                        href={item.href}
                                        className={`
                      flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200
                      ${isActive
                                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                                            : 'text-gray-700 hover:bg-gray-100'
                                        }
                    `}
                                    >
                                        {item.icon}
                                        <span>{item.name}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </nav>

                {/* User Info & Logout */}
                <div className="p-4 border-t border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                            <p className="text-xs text-gray-500 capitalize">{user.role.replace('_', ' ')}</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={logout} className="w-full">
                        Cerrar sesión
                    </Button>
                </div>
            </aside>

            {/* Mobile sidebar (overlay) */}
            {isSidebarOpen && (
                <div className="fixed inset-0 z-50 md:hidden flex">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
                    <aside className="relative w-72 sm:w-80 max-w-[85vw] bg-white/95 backdrop-blur-md shadow-2xl border-r border-gray-100 flex flex-col">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <Logo size="sm" />
                            <button onClick={() => setIsSidebarOpen(false)} className="p-2.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation">
                                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <nav className="flex-1 p-3 sm:p-4 space-y-2 overflow-y-auto">
                            {navigation.map((item, index) => {
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={`${item.href}-${index}`}
                                        href={item.href}
                                        onClick={() => setIsSidebarOpen(false)}
                                        className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-200 touch-manipulation ${isActive ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'}`}
                                    >
                                        {item.icon}
                                        <span className="text-sm sm:text-base">{item.name}</span>
                                    </Link>
                                );
                            })}
                            
                            {/* Botón "Más opciones" (móvil) */}
                            {secondaryNavigation.length > 0 && (
                                <button
                                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-200 touch-manipulation text-gray-700 hover:bg-gray-100 active:bg-gray-200"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showMoreMenu ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                                    </svg>
                                    <span className="text-sm sm:text-base">{showMoreMenu ? 'Menos opciones' : 'Más opciones'}</span>
                                </button>
                            )}
                            
                            {/* Opciones secundarias - aparecen debajo cuando showMoreMenu está activo (móvil) */}
                            {showMoreMenu && secondaryNavigation.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-gray-200">
                                    {secondaryNavigation.map((item, index) => {
                                        const isActive = pathname === item.href;
                                        return (
                                            <Link
                                                key={`secondary-mobile-${item.href}-${index}`}
                                                href={item.href}
                                                onClick={() => setIsSidebarOpen(false)}
                                                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-200 touch-manipulation ${isActive ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'}`}
                                            >
                                                {item.icon}
                                                <span className="text-sm sm:text-base">{item.name}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </nav>

                        <div className="p-4 border-t border-gray-100">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                                    <p className="text-xs text-gray-500 capitalize">{user.role.replace('_', ' ')}</p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => { setIsSidebarOpen(false); logout(); }} className="w-full">
                                Cerrar sesión
                            </Button>
                        </div>
                    </aside>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 overflow-auto min-h-0">
                {children}
            </main>
        </div>
    );
}
