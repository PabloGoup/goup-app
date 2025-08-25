import { useMemo, useState } from "react";
import { nanoid } from "nanoid";
import type { TicketTypeDraft } from "@/types/commerce";

const PRESETS = ["Early", "General", "VIP", "Golden"] as const;
type PresetName = typeof PRESETS[number];

export default function TicketTypesEditor({
  value,
  onChange,
  disabled,
  perUserLimitGlobal,
}: {
  value: TicketTypeDraft[];
  onChange: (next: TicketTypeDraft[]) => void;
  disabled?: boolean;
  perUserLimitGlobal?: number;
}) {
  // nombres bloqueados para presets (no editable)
  const [locked, setLocked] = useState<Set<string>>(new Set());

  const clampNonNeg = (n: number) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);

  const add = (preset?: PresetName) => {
    const id = nanoid(10);
    const next: TicketTypeDraft = {
      id,
      name: preset ?? "Personalizado",
      price: 0,
      stockTotal: 0,
      stockDisponible: 0,
      perUserLimit: null,
      orden: (value.at(-1)?.orden ?? 0) + 1,
      activo: true,
    };
    onChange([...value, next]);
    if (preset) setLocked((p) => new Set(p).add(id));
  };

  const update = (id: string, patch: Partial<TicketTypeDraft>) =>
    onChange(value.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const remove = (id: string) => {
    onChange(value.filter((v) => v.id !== id));
    setLocked((p) => {
      const cp = new Set(p);
      cp.delete(id);
      return cp;
    });
  };

  const fieldCls =
    "w-full bg-white/5  placeholder-white/40 border /10 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8e2afc] disabled:opacity-60";
  const labelCls = "text-[11px] uppercase tracking-wide /60 mb-1 block";

  const totalDisponible = useMemo(
    () =>
      value.reduce(
        (acc, t) => ({
          total: acc.total + clampNonNeg(Number(t.stockTotal || 0)),
          disp:
            acc.disp +
            clampNonNeg(
              Number(
                t.stockDisponible ?? clampNonNeg(Number(t.stockTotal || 0))
              )
            ),
        }),
        { total: 0, disp: 0 }
      ),
    [value]
  );

  return (
    <div className="space-y-4">
      {/* Acción: presets + personalizado */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => add(p)}
            disabled={disabled}
            className="rounded-full bg-white/[0.06] hover:bg-white/[0.12] border /10 px-3 py-1.5 text-sm font-medium"
          >
            + {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => add()}
          disabled={disabled}
          className="rounded-full bg-[#8e2afc] hover:bg-[#7b1fe0] px-3 py-1.5 text-sm font-semibold"
        >
          + Personalizado
        </button>

        {value.length > 0 && (
          <div className="ml-auto text-xs /60">
            Stock total:{" "}
            <span className="">{totalDisponible.total}</span> •
            Disponible: <span className="">{totalDisponible.disp}</span>
          </div>
        )}
      </div>

      {/* Vacío */}
      {value.length === 0 && (
        <div className="rounded-lg border border-dashed /15 bg-white/[0.03] p-4 text-sm /70">
          Agrega al menos un tipo si habilitas ventas.
        </div>
      )}

      {/* Lista de tipos */}
      <div className="space-y-3">
        {value.map((t, idx) => {
          const isLocked = locked.has(t.id!);
          const vendido = clampNonNeg((t.stockTotal ?? 0) - (t.stockDisponible ?? 0));
          const disponibleCalculado = clampNonNeg((t.stockTotal ?? 0) - vendido);

          return (
            <div
              key={t.id}
              className="rounded-xl border /10 bg-white/[0.02] p-4 shadow-sm"
            >
              {/* Header de la card */}
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-xs border /10">
                    {idx + 1}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <input
                        className={`${fieldCls} h-9 !py-1.5 !px-2 font-semibold max-w-[240px]`}
                        value={t.name}
                        readOnly={isLocked}
                        onChange={(e) => update(t.id!, { name: e.target.value })}
                      />
                      {isLocked && (
                        <span className="inline-flex items-center gap-1 rounded-md border /10 bg-white/[0.06] px-2 py-0.5 text-[11px] /70">
                          🔒 preset
                        </span>
                      )}
                      {!t.activo && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">
                          pausado
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] /50 mt-0.5">
                      ID: <span className="/70">{t.id}</span>
                    </p>
                  </div>
                </div>

                <div className="md:ml-auto flex items-center gap-3">
                  <label className="text-xs /60">Activo</label>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#8e2afc]"
                    checked={!!t.activo}
                    onChange={(e) => update(t.id!, { activo: e.target.checked })}
                  />
                  <button
                    type="button"
                    onClick={() => remove(t.id!)}
                    className="ml-2 rounded-md border /10 bg-white/[0.06] px-3 py-1.5 text-sm hover:bg-white/[0.12] text-red-300"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Campos */}
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div>
                  <label className={labelCls}>Precio (CLP)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 /50">$</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className={`${fieldCls} pl-7`}
                      value={t.price ?? 0}
                      onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                      onChange={(e) =>
                        update(t.id!, { price: clampNonNeg(Number(e.target.value)) })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Stock total</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={fieldCls}
                    value={t.stockTotal ?? 0}
                    onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                    onChange={(e) => {
                      const total = clampNonNeg(Number(e.target.value));
                      const vendidoNow = clampNonNeg(
                        (t.stockTotal ?? 0) - (t.stockDisponible ?? 0)
                      );
                      update(t.id!, {
                        stockTotal: total,
                        stockDisponible: Math.max(0, total - vendidoNow),
                      });
                    }}
                  />
                  <p className="mt-1 text-[11px] /50">
                    Disponible calculado:{" "}
                    <span className="/80">{disponibleCalculado}</span>
                  </p>
                </div>

                <div>
                  <label className={labelCls}>Límite por usuario</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={fieldCls}
                    placeholder={
                      perUserLimitGlobal && perUserLimitGlobal > 0
                        ? `Global ${perUserLimitGlobal}`
                        : "Sin tope"
                    }
                    value={t.perUserLimit ?? ""}
                    onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                    onChange={(e) =>
                      update(t.id!, {
                        perUserLimit:
                          e.target.value === "" ? null : clampNonNeg(Number(e.target.value)),
                      })
                    }
                  />
                </div>

                <div>
                  <label className={labelCls}>Orden</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={fieldCls}
                    value={t.orden ?? idx + 1}
                    onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                    onChange={(e) => update(t.id!, { orden: clampNonNeg(Number(e.target.value)) || 1 })}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}