'use client';

import { useState, FormEvent } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface EarningsPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticate: (password: string) => boolean;
}

export default function EarningsPasswordModal({
  isOpen,
  onClose,
  onAuthenticate,
}: EarningsPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Pequeño delay para feedback visual
    setTimeout(() => {
      const isValid = onAuthenticate(password);
      if (!isValid) {
        setError('Contraseña incorrecta');
        setPassword('');
      }
      setIsLoading(false);
    }, 200);
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Acceso Restringido"
      size="md"
    >
      <div className="space-y-4">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-900">
            Esta sección contiene información confidencial de ganancias.
          </p>
          <p className="text-xs text-yellow-700 mt-2">
            Por favor, introduce la contraseña para continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            error={error}
            placeholder="Ingresa la contraseña"
            autoFocus
            disabled={isLoading}
          />

          <div className="flex justify-end gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              isLoading={isLoading}
            >
              Acceder
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

