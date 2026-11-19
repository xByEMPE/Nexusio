"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/assessment/fields";
import { resolveLoginDestination } from "@/app/admin/login/actions";
import { getBrowserClient } from "@/services/supabase/browser";

/** Inicio de sesión con correo y contraseña de Supabase Auth. */
export function LoginForm({ area }: { area: "admin" | "portal" }) {
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
      setError("El acceso no está configurado.");
      return;
    }
    setLoading(true);
    const { error: authError } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setLoading(false);
      setError("Correo o contraseña incorrectos.");
      return;
    }
    const dest = await resolveLoginDestination();
    setLoading(false);
    if ("error" in dest) {
      setError("Esta cuenta no tiene acceso.");
      return;
    }
    router.replace(dest.path);
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} data-area={area} className="mt-6 flex flex-col gap-4" noValidate>
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
      <Link href="/auth/forgot-password" className="text-center text-sm text-accent-primary underline-offset-4 hover:underline">
        ¿Olvidaste tu contraseña?
      </Link>
    </form>
  );
}
