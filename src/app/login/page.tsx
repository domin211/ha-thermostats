import { LoginForm } from "./form";

export const metadata = { title: "Přihlášení · Termostaty" };

export default function LoginPage() {
  return (
    <main className="login">
      <div className="login-dial" aria-hidden>
        <svg viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="99" fill="#0e0e0f" />
          <path d="M 60 169.3 A 80 80 0 1 1 140 169.3" fill="none" stroke="#3a3a3c" strokeWidth="11" strokeLinecap="round" />
          <path d="M 60 169.3 A 80 80 0 0 1 100 20" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
        </svg>
        <span>
          <svg viewBox="0 0 24 24"><path fill="#ff9f0a" d="M12.6 2.2c.3 2.6-.8 4.3-2.2 5.9-1.5 1.7-3.4 3.4-3.4 6.5A5 5 0 0 0 12 19.8a5 5 0 0 0 5-5.1c0-2.2-1-3.9-2-5.1-.2 1.2-.8 2.1-1.7 2.6.4-3.4-.3-7.1-.7-10z" /></svg>
        </span>
      </div>
      <h1 className="large-title">Termostaty</h1>
      <p className="login-sub">Pro pokračování zadejte heslo.</p>
      <LoginForm />
    </main>
  );
}
