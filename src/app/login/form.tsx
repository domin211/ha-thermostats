"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="login-form">
      <div className="group">
        <input id="pw" name="password" type="password" placeholder="Heslo" aria-label="Heslo" autoComplete="current-password" autoFocus required />
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" className="primary" disabled={pending}>
        {pending ? "Ověřuji…" : "Odemknout"}
      </button>
    </form>
  );
}
