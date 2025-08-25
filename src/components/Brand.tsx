// src/components/Brand.tsx
import { ReactComponent as Owl } from '@/assets/buho_logo.svg'

export function Brand({ size = 24, compact = true }: { size?: number; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Owl style={{ width: size, height: size }} className="text-white" aria-hidden />
      {!compact && (
        <span className="leading-none font-black text-xl md:text-2xl tracking-tight">
          Go<span className="text-[#b688ff]">Up</span>
        </span>
      )}
      <span className="sr-only">GoUp</span>
    </span>
  )
}