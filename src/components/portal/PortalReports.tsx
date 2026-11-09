"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PortalReport } from "@/contracts/platform";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { createLogger } from "@/lib/observability/logger";
import { useDict } from "@/i18n/LocaleProvider";

const log = createLogger("ui.interaction");

const STATUS: Record<PortalReport["status"], { cls: string }> = {
  published: { cls: "border-accent-primary/50 text-telemetry-active" },
  in_review: { cls: "border-signal-caution/50 text-signal-caution" },
  draft: { cls: "border-border-strong text-foreground-subtle" },
};

export function PortalReports() {
  const t = useDict().portal;
  const PORTAL_REPORTS = t.reports;
  const [notice, setNotice] = useState<string | null>(null);

  const download = (r: PortalReport) => {
    log.info("portal.report_download", { report: r.id });
    setNotice(t.downloadNotice.replace("{title}", r.title).replace("{pages}", String(r.pages)));
    window.setTimeout(() => setNotice(null), 3200);
  };

  return (
    <div className="relative flex h-full flex-col">
      {/* Móvil: lista apilada */}
      <ul className="divide-y divide-border-subtle sm:hidden" aria-label={t.reportsAria}>
        {PORTAL_REPORTS.map((r) => (
          <li key={r.id} className="px-4 py-4">
            <div className="text-sm leading-snug">{r.title}</div>
            <div className="mt-0.5 text-xs text-foreground-subtle">{r.project}</div>
            <div className="mt-3 flex items-center gap-3">
              <span className="font-mono text-xs tabular text-foreground-muted">{r.date}</span>
              <span className={cn("inline-block rounded-[2px] border px-2 py-0.5 text-2xs", STATUS[r.status].cls)}>
                {t.reportStatus[r.status]}
              </span>
              <button
                type="button"
                onClick={() => download(r)}
                disabled={r.status !== "published"}
                className="ml-auto inline-flex items-center gap-2 rounded-[2px] border border-border-strong px-3 py-1.5 text-xs disabled:opacity-30"
              >
                PDF
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Tablet y escritorio: tabla */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[620px] text-sm">
          <caption className="sr-only">{t.reportsAria}</caption>
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
              <th scope="col" className="px-5 py-3 font-normal">{t.colReport}</th>
              <th scope="col" className="px-3 py-3 font-normal">{t.colDate}</th>
              <th scope="col" className="px-3 py-3 font-normal">{t.colStatus}</th>
              <th scope="col" className="px-5 py-3 text-right font-normal">
                <span className="sr-only">{t.colActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {PORTAL_REPORTS.map((r) => (
              <tr key={r.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-raised/60">
                <td className="px-5 py-3.5">
                  <div>{r.title}</div>
                  <div className="mt-0.5 text-xs text-foreground-subtle">{r.project}</div>
                </td>
                <td className="px-3 py-3.5 font-mono text-xs tabular text-foreground-muted">{r.date}</td>
                <td className="px-3 py-3.5">
                  <span className={cn("inline-block rounded-[2px] border px-2 py-0.5 text-2xs", STATUS[r.status].cls)}>
                    {t.reportStatus[r.status]}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    type="button"
                    onClick={() => download(r)}
                    disabled={r.status !== "published"}
                    className="inline-flex items-center gap-2 rounded-[2px] border border-border-strong px-3 py-1.5 text-xs transition-colors duration-spring-actuator ease-spring-actuator hover:border-foreground/60 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                      <path d="M8 2v9M4 7l4 4 4-4M3 14h10" stroke="currentColor" strokeWidth="1.4" fill="none" />
                    </svg>
                    PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-auto px-4 py-4 text-xs text-foreground-subtle sm:px-5">
        {t.reportsFootnote}
      </p>
      <AnimatePresence>
        {notice && (
          <motion.div
            role="status"
            className="panel absolute bottom-14 left-1/2 w-[min(90%,420px)] -translate-x-1/2 px-4 py-3 text-xs shadow-2xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={spring("actuator")}
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
