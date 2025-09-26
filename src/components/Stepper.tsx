// src/components/Stepper.tsx
export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex justify-center gap-2 py-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${
            i === current ? "bg-[#FE8B02]" : "bg-white/15"
          }`}
        />
      ))}
    </div>
  );
}