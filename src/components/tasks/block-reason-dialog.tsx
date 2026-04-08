'use client';

import { useState } from 'react';

interface BlockReasonDialogProps {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function BlockReasonDialog({ onConfirm, onCancel }: BlockReasonDialogProps) {
  const [reason, setReason] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div className="Polaris-Card" style={{ width: '420px', padding: '2.4rem', borderRadius: '12px' }}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36', marginBottom: '0.8rem' }}>Motivo del bloqueo</h2>
        <p style={{ fontSize: '1.3rem', color: '#637381', marginBottom: '1.6rem' }}>
          Describe por qué esta tarea está bloqueada
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej: Esperando aprobación del cliente..."
          rows={3}
          required
          style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px', resize: 'vertical', marginBottom: '1.6rem' }}
        />
        <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '0.6rem 1.6rem', fontSize: '1.3rem', fontWeight: 500, color: '#637381', backgroundColor: '#f4f6f8', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={() => { if (reason.trim()) onConfirm(reason.trim()); }}
            disabled={!reason.trim()}
            style={{ padding: '0.6rem 1.6rem', fontSize: '1.3rem', fontWeight: 500, color: 'white', backgroundColor: !reason.trim() ? '#d08070' : '#de3618', border: 'none', borderRadius: '4px', cursor: !reason.trim() ? 'not-allowed' : 'pointer' }}
          >
            Marcar como bloqueada
          </button>
        </div>
      </div>
    </div>
  );
}
