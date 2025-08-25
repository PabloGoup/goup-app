import React from "react";

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <h2 className="text-xl md:text-2xl font-extrabold text-primary-300">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm /60 mt-0.5">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}