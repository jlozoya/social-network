'use client';
import { useState } from 'react';
import { api } from '../../client/shared';
export default function DeletionForm() {
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState(''),
    [error, setError] = useState('');
  return (
    <form
      className="form card"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.currentTarget));
        setBusy(true);
        setError('');
        try {
          const response = await api<{ message: string }>('/api/deletion-requests', 'POST', body);
          setResult(response.message);
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {result ? (
        <p role="status">{result}</p>
      ) : (
        <>
          <label>
            Correo de tu cuenta
            <input name="email" type="email" required maxLength={254} autoComplete="email" />
          </label>
          <label>
            Nota para soporte (opcional)
            <textarea name="note" maxLength={500} rows={3} />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? 'Registrando…' : 'Solicitar eliminación de cuenta'}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
