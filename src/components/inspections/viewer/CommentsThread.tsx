"use client";

import { useState, type FormEvent } from "react";
import { addComment, deleteComment, editComment } from "@/lib/inspections/viewer-actions";
import { cn } from "@/lib/cn";
import type { ViewerComment } from "./finding-data";
import { canDeleteComment, canEditComment, fmtDateTime, type Me } from "./finding-logic";
import { useViewerMutation } from "./useViewerMutation";

const field = "w-full rounded-[2px] border border-border-subtle bg-background-base px-2 py-1 text-sm";
const link = "text-2xs text-foreground-muted underline hover:text-foreground disabled:opacity-40";

/** Hilo de comentarios de un daño (`findingId`) o de la inspección (sin `findingId`). */
export function CommentsThread({
  inspectionId,
  findingId,
  comments,
  canComment,
  me,
}: {
  inspectionId: string;
  findingId?: string;
  /** Todos los comentarios visibles de la inspección; aquí se filtra el hilo. */
  comments: ViewerComment[];
  canComment: boolean;
  me: Me;
}) {
  const thread = comments.filter((c) => (findingId ? c.finding_id === findingId : c.finding_id == null));
  const m = useViewerMutation();
  const [body, setBody] = useState("");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await m.run(addComment, { inspection_id: inspectionId, finding_id: findingId, body })) setBody("");
  };

  return (
    <section className="flex flex-col gap-2" data-testid={findingId ? "finding-comments" : "inspection-comments"}>
      <p className="label-caps">{findingId ? "Comentarios del daño" : "Comentarios de la inspección"}</p>
      {thread.length === 0 && <p className="text-xs text-foreground-muted">Sin comentarios.</p>}
      <ul className="flex flex-col gap-2">
        {thread.map((c) => (
          <CommentItem key={c.id} comment={c} canEdit={canEditComment(c, me, canComment)} canDelete={canDeleteComment(c, me, canComment)} />
        ))}
      </ul>
      {canComment && (
        <form onSubmit={add} className="flex flex-col gap-1.5">
          <textarea className={field} rows={2} maxLength={4000} placeholder="Escribe un comentario…" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Nuevo comentario" />
          {m.error && <p className="text-xs text-red-500">{m.error}</p>}
          <button type="submit" className="self-end rounded-[2px] border border-foreground px-2.5 py-1 text-xs font-medium disabled:opacity-40" disabled={m.pending || body.trim() === ""}>
            Comentar
          </button>
        </form>
      )}
    </section>
  );
}

function CommentItem({ comment: c, canEdit, canDelete }: { comment: ViewerComment; canEdit: boolean; canDelete: boolean }) {
  const m = useViewerMutation();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(c.body);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (await m.run(editComment, { id: c.id, body })) setEditing(false);
  };
  const remove = () => {
    if (window.confirm("¿Borrar este comentario?")) void m.run(deleteComment, { id: c.id });
  };

  return (
    <li className="rounded-[2px] border border-border-subtle p-2" data-testid="comment">
      <p className="flex flex-wrap items-baseline gap-x-2 text-2xs text-foreground-muted">
        <span className="font-medium text-foreground">{c.author_name || "Usuario"}</span>
        <time dateTime={c.created_at} suppressHydrationWarning>
          {fmtDateTime(c.created_at)}
        </time>
        {c.edited_at && <span>· editado</span>}
      </p>
      {editing ? (
        <form onSubmit={save} className="mt-1 flex flex-col gap-1.5">
          <textarea className={field} rows={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Editar comentario" />
          <div className="flex justify-end gap-3">
            <button type="button" className={link} onClick={() => (setEditing(false), setBody(c.body))}>
              Cancelar
            </button>
            <button type="submit" className={cn(link, "font-medium text-foreground")} disabled={m.pending || body.trim() === ""}>
              Guardar
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
      )}
      {m.error && <p className="text-xs text-red-500">{m.error}</p>}
      {!editing && (canEdit || canDelete) && (
        <div className="mt-1 flex gap-3">
          {canEdit && (
            <button type="button" className={link} onClick={() => setEditing(true)}>
              Editar
            </button>
          )}
          {canDelete && (
            <button type="button" className={link} onClick={remove} disabled={m.pending}>
              Borrar
            </button>
          )}
        </div>
      )}
    </li>
  );
}
