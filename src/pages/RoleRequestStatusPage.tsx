// src/pages/RoleRequestStatusPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, UseFormRegister } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/auth/AuthContext";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

// === Schema y tipos ===
const schema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  fecha_nacimiento: z.string().optional().or(z.literal("")),
  calle: z.string().optional().or(z.literal("")),
  ciudad: z.string().optional().or(z.literal("")),
  comuna: z.string().optional().or(z.literal("")),
  pais: z.string().optional().or(z.literal("")),
  solicitud_tipo: z.enum(["productor", "club_owner", "ambos"], {
    required_error: "Selecciona una opción",
  }),
});
type FormValues = z.infer<typeof schema>;

type DBUsuario = {
  uid: string;
  correo: string | null;
  nombre: string | null;
  fecha_nacimiento: string | null;
  calle: string | null;
  ciudad: string | null;
  comuna: string | null;
  pais: string | null;
  solicitud_tipo: "productor" | "club_owner" | "ambos" | null;
  solicitud_estado: "pendiente" | "aprobada" | "rechazada" | null;
  solicitud_enviada: Timestamp | null;
};

// === Componentes de formulario ===
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-1 text-sm font-medium /80">{label}</span>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </label>
  );
}

interface TextInputProps {
  name: keyof FormValues;
  register: UseFormRegister<FormValues>;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}
function TextInput({ name, register, type = "text", placeholder, disabled }: TextInputProps) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-md bg-transparent border /20 px-3 py-2 focus:outline-none focus:border-[#8e2afc] disabled:opacity-60"
      {...register(name)}
    />
  );
}

interface SelectInputProps {
  name: keyof FormValues;
  register: UseFormRegister<FormValues>;
  options: Array<{ value: FormValues["solicitud_tipo"]; label: string }>;
  disabled?: boolean;
}
function SelectInput({ name, register, options, disabled }: SelectInputProps) {
  return (
    <select
      disabled={disabled}
      className="w-full rounded-md bg-transparent border /20 px-3 py-2 focus:outline-none focus:border-[#8e2afc] disabled:opacity-60"
      {...register(name)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// (funciones auxiliares fmtLong, StatusBadge, Row quedan igual…)

export default function RoleRequestStatusPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [record, setRecord] = useState<DBUsuario | null>(null);
  const [editMode, setEditMode] = useState(false);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      nombre: "",
      fecha_nacimiento: "",
      calle: "",
      ciudad: "",
      comuna: "",
      pais: "",
      solicitud_tipo: "productor",
    },
  });
  const { register, handleSubmit, reset, formState: { errors } } = methods;

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const ref = doc(db, "usersWeb", user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setRecord(null);
      } else {
        const data = snap.data() as DBUsuario;
        setRecord({ ...data, uid: user.uid });
        reset({
          nombre: data.nombre ?? "",
          fecha_nacimiento: data.fecha_nacimiento ?? "",
          calle: data.calle ?? "",
          ciudad: data.ciudad ?? "",
          comuna: data.comuna ?? "",
          pais: data.pais ?? "",
          solicitud_tipo: data.solicitud_tipo ?? "productor",
        });
      }
      setLoading(false);
    })();
  }, [user, reset]);

  const solicitudEnviadaFecha = record?.solicitud_enviada ? record.solicitud_enviada.toDate().toLocaleString() : "—";

  const onReSend = async () => {
    if (!user || !record) return;
    setSaving(true);
    const ref = doc(db, "usersWeb", user.uid);
    await updateDoc(ref, { solicitud_estado: "pendiente", solicitud_enviada: serverTimestamp() });
    toast.success("Solicitud reenviada");
    setRecord(prev => prev ? { ...prev, solicitud_estado: "pendiente", solicitud_enviada: Timestamp.now() } : prev);
    setSaving(false);
  };

  const onSubmit = handleSubmit(async values => {
    if (!user) return;
    setSaving(true);
    const ref = doc(db, "usersWeb", user.uid);
    const payload = {
      nombre: values.nombre,
      fecha_nacimiento: values.fecha_nacimiento || null,
      calle: values.calle || null,
      ciudad: values.ciudad || null,
      comuna: values.comuna || null,
      pais: values.pais || null,
      solicitud_tipo: values.solicitud_tipo,
      solicitud_estado: "pendiente",
      solicitud_enviada: serverTimestamp(),
    };
    await setDoc(ref, payload, { merge: true });
    toast.success("Datos guardados y solicitud enviada");
    setEditMode(false);
    setRecord(prev => prev ? { ...prev, ...payload, solicitud_enviada: Timestamp.now() } : { ...(payload as any), uid: user.uid });
    setSaving(false);
  });

  if (loading) return <div className="p-6 ">Cargando...</div>;
  if (!record) return <div className="p-6 "><p>No se encontró tu registro.</p></div>;

  return (
    <main className="bg-black ">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* … resto de la UI usando <Field>, <TextInput register={register} … />, <SelectInput register={register} … /> … */}
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <p className="text-sm /80 flex items-baseline justify-between gap-3">
      <span className="/60">{k}</span>
      <span className="text-right">{v ?? "—"}</span>
    </p>
  );
}