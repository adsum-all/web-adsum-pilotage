import { useState } from "react";

import { ApiError, type Session, aAccesPilotage, login, loginVerify } from "../api.js";
import { useMarque } from "../useMarque.js";

interface LoginProps {
  onAuth: (session: Session) => void;
}

export function Login({ onAuth }: LoginProps): JSX.Element {
  const marque = useMarque();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [faireConfiance, setFaireConfiance] = useState(false);
  const [otpRequired, setOtpRequired] = useState(false);
  const [canal, setCanal] = useState<string | null>(null);
  const [alerteEmail, setAlerteEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finaliser(session: Session): Promise<void> {
    // Access is scope-based: authorized when the account resolves a perimeter.
    if (!(await aAccesPilotage(session.token))) {
      setError("Votre compte n'est pas encore responsable d'un perimetre. Contactez l'administration.");
      return;
    }
    onAuth(session);
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (otpRequired) {
        await finaliser(await loginVerify(email, password, code.trim(), faireConfiance));
        return;
      }
      const result = await login(email, password);
      if (result.otpRequired) {
        setOtpRequired(true);
        setCanal(result.canal);
        setAlerteEmail(result.alerteEmail);
        return;
      }
      if (result.session) await finaliser(result.session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form onSubmit={submit} className="auth-card">
        <div className="brand brand-lg">
          <span className="brand-logo" aria-hidden="true">{marque.initiale}</span>
          <span className="brand-text">
            {marque.marque}
            <span className="brand-sub">Pilotage</span>
          </span>
        </div>

        {!otpRequired && (
          <>
            <label>
              <span>Courriel</span>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              <span>Mot de passe</span>
              <div className="pw-field">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="pw-toggle"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "Masquer" : "Afficher"}
                </button>
              </div>
            </label>
          </>
        )}

        {otpRequired && (
          <>
            <p className="muted small">
              Un code de vérification vous a été envoyé{canal === "telegram" ? " sur Telegram" : " par courriel"}. Saisissez-le pour continuer.
            </p>
            {alerteEmail && <p className="banner banner-warn small">{alerteEmail}</p>}
            <label>
              <span>Code de vérification</span>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={faireConfiance} onChange={(e) => setFaireConfiance(e.target.checked)} />
              <span className="small">Faire confiance à cet appareil pendant 30 jours</span>
            </label>
          </>
        )}

        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Connexion..." : otpRequired ? "Valider le code" : "Se connecter"}
        </button>
        <p className="muted small center">Pilotage de votre perimetre.</p>
      </form>
    </div>
  );
}
