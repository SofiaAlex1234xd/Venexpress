'use client';

import { useState, useCallback } from 'react';
import { EARNINGS_PASSWORD } from '@/config/earnings-password.config';

/**
 * Hook personalizado para manejar la autenticación por contraseña del módulo de ganancias.
 * 
 * IMPORTANTE: El estado de autenticación es por sesión (usando useState),
 * lo que significa que NO se comparte entre diferentes dispositivos o pestañas.
 * Si el usuario introduce la contraseña en un dispositivo, no se verá en otro.
 */
export function useEarningsPassword() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const checkPassword = useCallback((password: string): boolean => {
    return password === EARNINGS_PASSWORD;
  }, []);

  const authenticate = useCallback((password: string): boolean => {
    const isValid = checkPassword(password);
    if (isValid) {
      setIsAuthenticated(true);
      setShowModal(false);
    }
    return isValid;
  }, [checkPassword]);

  const openAuthModal = useCallback(() => {
    setShowModal(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
  }, []);

  return {
    isAuthenticated,
    showModal,
    authenticate,
    openAuthModal,
    closeAuthModal,
    logout,
  };
}

