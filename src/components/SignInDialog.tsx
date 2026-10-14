import { useState, type FormEvent } from 'react';
import { sendSignInLink, signInWithGoogle } from '../hooks/useAuth';

interface Props {
  onClose: () => void;
}

export function SignInDialog({ onClose }: Props) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await sendSignInLink(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      // Supabase's built-in mailer allows only a few emails an hour; say so rather than a raw error.
      const status = (err as { status?: number }).status;
      setError(
        status === 429
          ? 'Too many sign-in emails were sent just now. Wait a few minutes and try again.'
          : "Couldn't send the sign-in link. Check the address and your connection, then try again.",
      );
    } finally {
      setSending(false);
    }
  }

  async function google() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError("Couldn't start Google sign-in. Try again, or use an emailed link.");
    }
  }

  return (
    <div className="arrangement-overlay" onClick={onClose}>
      <div className="arrangement-panel dialog-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="arrangement-panel-header">
          <h2>Sign in</h2>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="hint">Sign in to save as many songs as you like and open them on any device.</p>

        {sentTo ? (
          <p className="sign-in-sent">
            Check your inbox at <strong>{sentTo}</strong> and open the link. It signs you in on whichever device
            you open it.
          </p>
        ) : (
          <form onSubmit={sendLink}>
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
            <button type="submit" disabled={sending || !email.trim()}>
              {sending ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        )}

        <div className="sign-in-divider">or</div>
        <button className="secondary" onClick={() => void google()}>
          Continue with Google
        </button>

        {error && <p className="hint library-error">{error}</p>}
      </div>
    </div>
  );
}
