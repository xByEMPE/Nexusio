"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/assessment/fields";
import { setPassword } from "./actions";

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    const res = await setPassword(password);
    setLoading(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.replace(res.path);
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-2">
        <span className="label-caps">Nueva contraseña</span>
        <TextInput type="password" autoComplete="new-password" required value={password} onChange={(e) => setPasswordValue(e.target.value)} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="label-caps">Repite la contraseña</span>
        <TextInput type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <p className="text-xs text-foreground-subtle">Mínimo 12 caracteres, con mayúsculas, minúsculas, dígitos y símbolos.</p>
      {error && (
        <p role="alert" className="text-sm text-signal-critical">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading || !password || !confirm} className="mt-2 w-full">
        {loading ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
