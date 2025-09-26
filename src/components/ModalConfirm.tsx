// src/components/ConfirmModal.tsx
import React from "react";

interface ConfirmModalProps {
  title: string;
  description: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ModalConfirm({
  title,
  description,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
      <div className="bg-neutral-900 rounded-md p-6 w-[90vw] max-w-sm text-center border /10">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="/70 mb-5">{description}</p>
        <div className="flex justify-center gap-3">
          <button
            className="px-4 py-2 rounded border /20 hover:bg-white/10"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            className={`px-4 py-2 rounded ${
              loading ? "opacity-60 cursor-not-allowed" : "bg-[#FE8B02] hover:bg-[#7b1fe0]"
            }`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Guardando…" : "Sí, guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}