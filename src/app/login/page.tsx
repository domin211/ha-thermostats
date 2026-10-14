import { LoginForm } from "./form";

export const metadata = { title: "Sign in · Thermostats" };

export default function LoginPage() {
  return (
    <main className="login">
      <div className="login-panel">
        <div className="login-mark" aria-hidden>
          <span />
        </div>
        <h1>Climate control</h1>
        <p className="muted">Enter the panel password to continue.</p>
        <LoginForm />
      </div>
    </main>
  );
}
