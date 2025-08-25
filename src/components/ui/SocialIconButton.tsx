import React from "react";

export function SocialIconButton({
  href,
  children,
  label,
}: {
  href?: string;
  children: React.ReactNode;
  label?: string;
}) {
  if (!href) return null;
  const safeHref = href.startsWith("http") ? href : `https://${href}`;
  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full
                 border /15 bg-white/5 hover:bg-white/10 transition"
    >
      {children}
    </a>
  );
}