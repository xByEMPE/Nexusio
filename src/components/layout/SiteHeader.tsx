"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useDict } from "@/i18n/LocaleProvider";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { NexusMark, Wordmark } from "@/components/brand/NexusMark";
import { ButtonLink } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { createLogger } from "@/lib/observability/logger";

const navLog = createLogger("ui.navigation");

export function SiteHeader() {
  const t = useDict();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  const track = (href: string) => {
    navLog.info("nav.anchor", { href });
    setOpen(false);
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-spring-gimbal ease-spring-gimbal",
        scrolled || open
          ? "border-border-subtle bg-background-base/80 backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="container flex h-16 items-center justify-between">
        <Link href={t.meta.homePath} className="flex items-center gap-3" aria-label={t.nav.homeAria}>
          <NexusMark className="h-7 w-7" animated={false} spinning={false} />
          <Wordmark className="text-lg" />
        </Link>

        <nav aria-label={t.nav.mainAria} className="hidden items-center gap-6 lg:flex xl:gap-8">
          {t.nav.items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => track(item.href)}
              className="relative text-sm text-foreground-muted transition-colors duration-spring-actuator ease-spring-actuator hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <ButtonLink
            href={`${t.meta.homePath}#evaluacion`}
            arrow
            className="hidden lg:inline-flex"
            onClick={() => track("#evaluacion")}
          >
            {t.nav.cta}
          </ButtonLink>

        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-[2px] border border-border-subtle lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <motion.path
              stroke="currentColor"
              strokeWidth={1.4}
              animate={{ d: open ? "M3 3 L13 13" : "M2 5 L14 5" }}
              transition={spring("actuator")}
            />
            <motion.path
              stroke="currentColor"
              strokeWidth={1.4}
              animate={{ d: open ? "M3 13 L13 3" : "M2 11 L14 11" }}
              transition={spring("actuator")}
            />
          </svg>
        </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label={t.nav.mobileAria}
            className="container overflow-hidden lg:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring("gimbal")}
          >
            <ul className="flex flex-col gap-1 pb-6 pt-2">
              {t.nav.items.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => track(item.href)}
                    className="block border-b border-border-subtle py-3 text-foreground-muted hover:text-foreground"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li className="pt-4">
                <ButtonLink href={`${t.meta.homePath}#evaluacion`} className="w-full" arrow onClick={() => track("#evaluacion")}>
                  {t.nav.cta}
                </ButtonLink>
              </li>
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
