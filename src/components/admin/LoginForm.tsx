"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/assessment/fields";
import { getBrowserClient } from "@/services/supabase/browser";

/** Inicio de sesión con correo y contraseña de Supabase Auth. */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const sb = getBrowserClient();
    if (!sb) {
      setError("El panel no está configurado.");
      return;
    }
    setLoading(true);
    const { error: authError } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (authError) {
      setError("Correo o contraseña incorrectos.");
      return;
    }
    router.replace("/admin");
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-2">
        <span className="label-caps">Correo</span>
        <TextInput type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="label-caps">Contraseña</span>
        <TextInput
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-signal-critical">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading || !email || !password} className="mt-2 w-full">
        {loading ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
