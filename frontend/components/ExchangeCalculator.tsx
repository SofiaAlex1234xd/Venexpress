'use client';

import { useState, useEffect } from 'react';

interface ExchangeCalculatorProps {
    rate: number;
    isOpen: boolean;
    onClose: () => void;
}

export default function ExchangeCalculator({ rate, isOpen, onClose }: ExchangeCalculatorProps) {
    const [amountCOP, setAmountCOP] = useState('');
    const [amountBs, setAmountBs] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setAmountCOP('');
            setAmountBs('');
        }
    }, [isOpen]);

    const formatCOP = (value: number) => {
        return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
    };

    const handleCOPChange = (value: string) => {
        // Eliminar puntos para obtener el valor numérico crudo
        const rawValue = value.replace(/\./g, '');

        // Permitir solo números
        if (rawValue === '' || /^\d+$/.test(rawValue)) {
            if (rawValue === '') {
                setAmountCOP('');
                setAmountBs('');
                return;
            }

            const cop = parseFloat(rawValue);
            setAmountCOP(formatCOP(cop));

            const bs = cop / rate;
            setAmountBs(bs.toFixed(2));
        }
    };

    const handleBsChange = (value: string) => {
        setAmountBs(value);
        if (value && !isNaN(parseFloat(value))) {
            const bs = parseFloat(value);
            const cop = bs * rate;
            setAmountCOP(formatCOP(cop));
        } else {
            setAmountCOP('');
        }
    };

    const handleClear = () => {
        setAmountCOP('');
        setAmountBs('');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 relative animate-fade-in">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Header */}
                <div className="mb-4 sm:mb-6">
                    <div className="flex items-center gap-2 sm:gap-3 mb-2">
                        <div className="w-10 sm:w-12 h-10 sm:h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
                            <svg className="w-5 sm:w-6 h-5 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Calculadora</h2>
                            <p className="text-xs sm:text-sm text-gray-500">Tasa: {rate.toFixed(2)} Bs/COP</p>
                        </div>
                    </div>
                </div>

                {/* Calculator */}
                <div className="space-y-4">
                    {/* COP Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Pesos Colombianos (COP)
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={amountCOP}
                                onChange={(e) => handleCOPChange(e.target.value)}
                                placeholder="0"
                                className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-lg font-semibold"
                            />
                        </div>
                    </div>

                    {/* Exchange Icon */}
                    <div className="flex justify-center">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                        </div>
                    </div>

                    {/* Bs Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Bolívares (Bs)
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Bs</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                value={amountBs}
                                onChange={(e) => handleBsChange(e.target.value)}
                                placeholder="0.00"
                                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-lg font-semibold"
                            />
                        </div>
                    </div>

                    {/* Info Box */}
                    {amountCOP && amountBs && (
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4">
                            <p className="text-sm text-gray-700">
                                <span className="font-bold">${amountCOP} COP</span>
                                {' '}equivale a{' '}
                                <span className="font-bold">{parseFloat(amountBs).toLocaleString('es-CO')} Bs</span>
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                Tasa aplicada: {rate.toFixed(2)} Bs/COP
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={handleClear}
                            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                        >
                            Limpiar
                        </button>
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-lg"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes fade-in {
                    from {
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                .animate-fade-in {
                    animation: fade-in 0.2s ease-out;
                }
            `}</style>
        </div>
    );
}
