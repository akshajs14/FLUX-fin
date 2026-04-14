import { useEffect, useState } from 'react';
import { auth } from '../lib/palantir';
import { GlowFrame } from './GlowFrame';

export function AuthCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Calling signIn() on the callback URL completes the PKCE token exchange.
    // The OSDK detects the `code` + `state` params and swaps them for an access token.
    auth.signIn()
      .then(() => {
        setStatus('success');
        // Remove the OAuth params from the URL and return to the dashboard.
        window.history.replaceState({}, '', '/');
        // Small delay so the user sees the success state, then reload the app.
        setTimeout(() => window.location.replace('/'), 800);
      })
      .catch((err: unknown) => {
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: "'Barlow Condensed', sans-serif",
    }}>
      {/* Logo */}
      <div style={{ fontSize: 48, color: 'var(--a)', fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>Φ</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 1 }}>FLUX</div>

      {status === 'loading' && (
        <>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2px solid var(--border)',
            borderTopColor: 'var(--a)',
            animation: 'spin .7s linear infinite',
          }} />
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 2 }}>
            Completing authentication…
          </div>
        </>
      )}

      {status === 'success' && (
        <div style={{ fontSize: 13, color: 'var(--green)', letterSpacing: 1 }}>
          ✓ Authenticated — redirecting…
        </div>
      )}

      {status === 'error' && (
        <>
          <div style={{ fontSize: 13, color: 'var(--red)', letterSpacing: 1 }}>⚠ Authentication failed</div>
          {error && (
            <GlowFrame borderRadius={8} className="border-glow--w100" style={{ maxWidth: 400 }}>
              <div
                className="glow-strip"
                style={{
                  fontSize: 11,
                  color: 'var(--text3)',
                  padding: '10px 16px',
                  textAlign: 'center',
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            </GlowFrame>
          )}
          <GlowFrame borderRadius={5} glowRadius={28} glowIntensity={0.7} className="border-glow--inline-flex" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="glow-strip"
              onClick={() => window.location.replace('/')}
              style={{
                padding: '8px 20px',
                border: 'none',
                background: 'none',
                color: 'var(--text2)',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'inherit',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Return to Dashboard
            </button>
          </GlowFrame>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
