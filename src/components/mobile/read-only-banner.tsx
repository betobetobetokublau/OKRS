'use client';

/**
 * Phone-only notice for admin screens that stay read-only on small screens
 * (design B1: Equipo and Periodos are edited from the desktop web). Hidden on
 * desktop through the `.m-only` utility.
 */
export function MobileReadOnlyBanner({ what }: { what: string }) {
  return (
    <p className="m-only" role="note" style={{ margin: '0 0 1.2rem', padding: '0.9rem 1.2rem', borderRadius: '8px', border: '1px solid #fadbd0', backgroundColor: '#fff4ef', color: '#8a3c1a', fontSize: '1.25rem', lineHeight: 1.45 }}>
      En el teléfono {what} se consulta en solo lectura. Para crear o editar, usa la versión web en tu computadora.
    </p>
  );
}
