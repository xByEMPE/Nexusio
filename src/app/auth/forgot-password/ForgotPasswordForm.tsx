"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/assessment/fields";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResult(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      setResult(await requestPasswordReset(fd));
    } catch {
      setResult({ ok: false, message: "Ocurrió un error inesperado. Inténtalo de nuevo." });
    }
    setLoading(false);
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-2">
        <span className="label-caps">Correo</span>
        <TextInput name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {/* Campo trampa: invisible para personas; los bots lo rellenan. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Sitio web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-foreground-muted" : "text-sm text-signal-critical"}>
          {result.message}
        </p>
      )}
      <Button type="submit" disabled={loading || !email} className="mt-2 w-full">
        {loading ? "Enviando…" : "Enviar enlace"}
      </Button>
    </form>
  );
}
