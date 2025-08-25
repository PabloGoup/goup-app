// src/components/DistanceSlider.tsx
import React, { useMemo, useState } from "react";
import { MapPin } from "lucide-react";

export default function DistanceSlider({
  value,
  setValue,
  min = 1,
  max = 50,
  step = 1,
  unit = "km",
  label = "Buscar clubes en:",
}: {
  value: number;
  setValue: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
}) {
  const [showTip, setShowTip] = useState(false);
  const pct = useMemo(() => ((value - min) / (max - min)) * 100, [value, min, max]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 my-4">
      <div className="flex items-center gap-2 text-foreground/80 text-sm font-medium">
        <MapPin className="w-4 h-4 text-[#8e2afc]" />
        <span>{label}</span>
      </div>

      <div className="flex-1 flex items-center gap-3">
        <div className="relative w-full">
          {/* pista */}
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-[#8e2afc]" style={{ width: `${pct}%`, opacity: 0.7 }} />
          </div>

          {/* input */}
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            step={step}
            onChange={(e) => setValue(Number(e.target.value))}
            aria-label="Distancia en kilómetros"
            onPointerDown={() => setShowTip(true)}
            onPointerUp={() => setShowTip(false)}
            onTouchStart={() => setShowTip(true)}
            onTouchEnd={() => setShowTip(false)}
            onMouseDown={() => setShowTip(true)}
            onMouseUp={() => setShowTip(false)}
            onFocus={() => setShowTip(true)}
            onBlur={() => setShowTip(false)}
            className="
              absolute inset-0 w-full appearance-none bg-transparent
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#8e2afc]/40
              [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:transition-transform
              [&::-webkit-slider-thumb]:active:scale-95
              [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5
              [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white
              [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#8e2afc]/40
              [&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:active:scale-95
            "
          />

          {/* tooltip móvil: solo visible si se está interactuando o hay foco */}
          {showTip && (
            <div
              className="sm:hidden absolute -top-7 left-0 select-none"
              style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
            >
              <div className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#8e2afc] text-white shadow">
                {value} {unit}
              </div>
            </div>
          )}
        </div>

        {/* chip ≥sm */}
        <div className="hidden sm:inline-flex items-baseline gap-1 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-sm">
          <strong className="font-semibold">{value}</strong>
          <span className="text-foreground/70 text-xs">{unit}</span>
        </div>
      </div>
    </div>
  );
}