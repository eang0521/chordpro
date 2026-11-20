import { useState, type FormEvent } from 'react';
import { authErrorMessage, MIN_PASSWORD_LENGTH, sendPasswordReset, signInWithPassword, signUp } from '../hooks/useAuth';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface Props {
  onClose: () => void;
}

type Mode = 'signIn' | 'signUp' | 'reset';

const TITLES: Record<Mode, string> = {
  signIn: 'Sign in',
  signUp: 'Create an account',
  reset: 'Reset your password',
};

export function SignInDialog({ onClose }: Props) {
  useEscapeKey(onClose);
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Set once an email has gone out (account confirmation or password reset): what to tell the person.
  const [sent, setSent] = useState<{ mode: 'signUp' | 'reset'; to: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signIn') {
        // Success signs in, and App closes this dialog when the session arrives.
        await signInWithPassword(address, password);
      } else if (mode === 'signUp') {
        await signUp(address, password);
        setSent({ mode, to: address });
      } else {
        await sendPasswordReset(address);
        setSent({ mode, to: address });
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const needsPassword = mode !== 'reset';
  const canSubmit = !busy && email.trim() !== '' && (!needsPassword || password !== '');

  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className="arrangement-panel dialog-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="arrangement-panel-header">
          <h2>{TITLES[sent?.mode ?? mode]}</h2>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {sent ? (
          <>
            <p className="sign-in-sent">
              {sent.mode === 'signUp' ? (
                <>
                  We’ve sent a link to <strong>{sent.to}</strong>. Open it to confirm your address and finish
                  creating your account. If you already have an account with that email, sign in instead, or use
                  “Forgot password?”.
                </>
              ) : (
                <>
                  If <strong>{sent.to}</strong> has an account, we’ve sent it a link. Open it to choose a new
                  password.
                </>
              )}
            </p>
            <button
              className="link-button"
              onClick={() => {
                setSent(null);
                switchMode('signIn');
              }}
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <p className="hint">
              {mode === 'reset'
                ? 'Enter your account’s email and we’ll send you a link to choose a new password.'
                : 'Sign in to save as many songs as you like and open them on any device.'}
            </p>
            <form className="sign-in-form" onSubmit={submit}>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {needsPassword && (
                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    required
                    minLength={mode === 'signUp' ? MIN_PASSWORD_LENGTH : undefined}
                    autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode === 'signUp' && <small className="hint">At least {MIN_PASSWORD_LENGTH} characters.</small>}
                </label>
              )}
              <button type="submit" disabled={!canSubmit}>
                {busy
                  ? 'Please wait…'
                  : mode === 'signIn'
                    ? 'Sign in'
                    : mode === 'signUp'
                      ? 'Create account'
                      : 'Email me a reset link'}
              </button>
            </form>

            {error && <p className="hint library-error">{error}</p>}

            <div className="sign-in-links">
              {mode === 'signIn' && (
                <>
                  <button className="link-button" onClick={() => switchMode('reset')}>
                    Forgot password?
                  </button>
                  <span>
                    New here?{' '}
                    <button className="link-button" onClick={() => switchMode('signUp')}>
                      Create an account
                    </button>
                  </span>
                </>
              )}
              {mode !== 'signIn' && (
                <button className="link-button" onClick={() => switchMode('signIn')}>
                  Back to sign in
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
