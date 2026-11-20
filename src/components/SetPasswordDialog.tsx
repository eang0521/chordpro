import { useState, type FormEvent } from 'react';
import { authErrorMessage, MIN_PASSWORD_LENGTH, setNewPassword } from '../hooks/useAuth';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface Props {
  /** Called after the password is saved, or when the person chooses to do it later. */
  onDone: () => void;
}

/** Shown after opening a password-reset link, which has already signed the person in. */
export function SetPasswordDialog({ onDone }: Props) {
  useEscapeKey(onDone);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setNewPassword(password);
      setSaved(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="arrangement-overlay">
      <div className="arrangement-panel dialog-panel" role="dialog" aria-modal="true">
        <h2>Choose a new password</h2>
        {saved ? (
          <>
            <p className="sign-in-sent">Your password is changed. Any other devices you were signed in on are signed out.</p>
            <button onClick={onDone}>Done</button>
          </>
        ) : (
          <>
            <form className="sign-in-form" onSubmit={submit}>
              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  required
                  autoFocus
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <small className="hint">At least {MIN_PASSWORD_LENGTH} characters.</small>
              </label>
              <label className="field">
                <span>Type it again</span>
                <input
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <button type="submit" disabled={busy || !password || !confirm}>
                {busy ? 'Saving…' : 'Save password'}
              </button>
            </form>
            {error && <p className="hint library-error">{error}</p>}
            <div className="sign-in-links">
              <button className="link-button" onClick={onDone}>
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
