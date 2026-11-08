"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { reveal, revealStatic, staggerChildren } from "@/lib/motion";

/** Contenedor que revela a sus hijos `RevealItem` al entrar en viewport. */
export function Reveal({
  stagger = 0.06,
  delay = 0,
  amount = 0.25,
  ...props
}: HTMLMotionProps<"div"> & { stagger?: number; delay?: number; amount?: number }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={staggerChildren(stagger, delay)}
      {...props}
    />
  );
}

export function RevealItem(props: HTMLMotionProps<"div">) {
  const reduced = useReducedMotion();
  return <motion.div variants={reduced ? revealStatic : reveal} {...props} />;
}
