import "server-only";
import nodemailer from "nodemailer";
import type { AssessmentRequest } from "@/contracts/assessment";
import {
  labelFleet,
  labelHosting,
  labelIndustry,
  labelObjective,
  labelService,
  labelTimeline,
} from "@/lib/request-labels";

/**
 * Aviso por correo de una solicitud nueva, enviado por SMTP con la cuenta de
 * correo de Hostinger. Variables:
 *   SMTP_HOST (smtp.hostinger.com), SMTP_PORT (465), SMTP_USER, SMTP_PASSWORD,
 *   NOTIFY_EMAIL (destino; por defecto SMTP_USER), SITE_URL (enlace al panel).
 */
interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  to: string;
}

function readSmtp(): SmtpConfig | null {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return {
    host: process.env.SMTP_HOST ?? "smtp.hostinger.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    user,
    pass,
    to: process.env.NOTIFY_EMAIL ?? user,
  };
}

export function isEmailConfigured(): boolean {
  return readSmtp() !== null;
}

/** Escapa texto del visitante antes de insertarlo en HTML. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendNewRequestEmail(
  data: AssessmentRequest,
  meta: { id: string; reference: string },
): Promise<void> {
  const cfg = readSmtp();
  if (!cfg) throw new Error("smtp_not_configured");

  const site = (process.env.SITE_URL ?? "https://nexusio.com.mx").replace(/\/$/, "");
  const panelUrl = `${site}/admin/solicitudes/${meta.id}`;

  const rows: [string, string][] = [
    ["Empresa", data.company],
    ["Contacto", `${data.fullName} · ${data.role}`],
    ["Correo", data.email],
    ["País", data.country],
    ["Rubro", labelIndustry(data.industry)],
    ["Necesita", data.services.map(labelService).join(", ")],
    ["Drones", labelFleet(data.fleetSize)],
    ["Modelos", data.aircraftModels || "—"],
    ["Alojamiento", labelHosting(data.hosting)],
    ["Objetivos", data.objectives.map(labelObjective).join(", ")],
    ["Para cuándo", labelTimeline(data.timeline)],
  ];

  const text = [
    `Nueva solicitud ${meta.reference}`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Descripción:",
    data.projectSummary,
    "",
    `Ver en el panel: ${panelUrl}`,
  ].join("\n");

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#0d1016">
<div style="max-width:600px;margin:0 auto;padding:24px">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1f66e5">NEXUS · Nueva solicitud</p>
  <h1 style="margin:0 0 4px;font-size:22px">${esc(data.company)}</h1>
  <p style="margin:0 0 20px;font-size:13px;color:#727985">Referencia ${esc(meta.reference)}</p>
  <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e5ea">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:10px 14px;border-bottom:1px solid #e2e5ea;font-size:12px;color:#727985;width:140px;vertical-align:top">${esc(k)}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e5ea;font-size:14px">${esc(v)}</td></tr>`,
      )
      .join("")}
  </table>
  <h2 style="margin:20px 0 8px;font-size:14px">Descripción del proyecto</h2>
  <p style="margin:0;padding:14px;background:#fff;border:1px solid #e2e5ea;font-size:14px;line-height:1.55;white-space:pre-wrap">${esc(data.projectSummary)}</p>
  <p style="margin:24px 0 0"><a href="${esc(panelUrl)}" style="display:inline-block;background:#1f66e5;color:#fff;text-decoration:none;padding:12px 18px;font-size:14px">Abrir en el panel</a></p>
</div></body></html>`;

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  await transport.sendMail({
    from: `"NEXUS · Sitio web" <${cfg.user}>`,
    to: cfg.to,
    replyTo: `"${data.fullName.replace(/"/g, "")}" <${data.email}>`,
    subject: `Nueva solicitud ${meta.reference} · ${data.company}`,
    text,
    html,
  });
}
