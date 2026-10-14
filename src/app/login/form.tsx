"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="login-form">
      <label htmlFor="pw" className="label">
        Password
      </label>
      <input id="pw" name="password" type="password" autoComplete="current-password" autoFocus required />
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Checking" : "Unlock"}
      </button>
    </form>
  );
}
