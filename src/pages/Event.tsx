// src/pages/Event.tsx
import React, { useState } from "react";
import {
  useForm,
  FormProvider,
  type FieldError,
  type FieldPath,
  type FieldErrors,
  type FieldValues,
  type Resolver,
} from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/goup_logo.png";
import { eventSchema } from "@/lib/schemas";
import { useStepper } from "@/hooks/useStepper";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { LineupFields } from "@/components/form/LineupFields";

import {
  RHFInput,
  RHFTextarea,
  RHFSelect,
  RHFCheckboxGroup,
  RHFFile,
  StepErrorBanner,
} from "@/components/form/control";

/* =========================================================
 * Tipos locales
 * =======================================================*/
export type EventFormValues = z.infer<typeof eventSchema>;
type Keys = FieldPath<EventFormValues>;

/* =========================================================
 * Defaults alineados al schema (mantengo tus nombres)
 * =======================================================*/
const defaultEventValues: EventFormValues = {
  nombre: "",
  tipo: "",
  fecha: "",
  horaInicio: "",
  horaCierre: "",
  capacidad: "",
  presupuesto: "",
  promotor: "",
  telefono: "",
  email: "",
  desc: "",
  generos: [],
  flyer: null,
  imgSec: null,
  edad: 18,
  tieneVip: "",         // select: "No" | "1" | "2" | ... | "Más de 5"
  vip: "",              // (no usado en UI, se ignora en payload)
  reservas: false,      // select "Sí"/"No" → lo fuerzo a boolean
  tieneLineup: false,   // select "Sí"/"No" → lo fuerzo a boolean
  cantidadDJs: "",      // derivado de djs.length al enviar
  djs: [],
  dress_code: "",
};

const generosMusicales = [
  "Reguetón",
  "Techno",
  "House",
  "Pop",
  "Salsa",
  "Hardstyle",
  "Trance",
  "Hip-Hop",
  "Urbano",
] as const;

/* =========================================================
 * Helpers de errores (igual que tuyo)
 * =======================================================*/
function isFieldError(v: unknown): v is FieldError {
  return typeof v === "object" && v !== null && "message" in (v as Record<string, unknown>);
}
function flattenErrors<T extends FieldValues>(
  obj: FieldErrors<T>,
  prefix: FieldPath<T> | "" = ""
): Record<FieldPath<T>, string> {
  const out: Partial<Record<FieldPath<T>, string>> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = (prefix ? `${prefix}.${k}` : k) as FieldPath<T>;
    if (isFieldError(v) && typeof v.message === "string") {
      out[key] = v.message;
    } else if (v && typeof v === "object") {
      Object.assign(out, flattenErrors<T>(v as FieldErrors<T>, key));
    }
  }
  return out as Record<FieldPath<T>, string>;
}
function collectStepErrors<T extends FieldValues>(
  errors: FieldErrors<T>,
  fields: FieldPath<T>[]
): string[] {
  const flat = flattenErrors<T>(errors);
  return fields.map((f) => flat[f]).filter(Boolean) as string[];
}

/* =========================================================
 * UI locales
 * =======================================================*/
function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${i === step ? "bg-[#8e2afc]" : "bg-white/20"}`}
        />
      ))}
    </div>
  );
}
type LoadingButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "solid" | "outline";
};
function LoadingButton({
  loading,
  variant = "solid",
  children,
  className = "",
  ...rest
}: LoadingButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50";
  const styles =
    variant === "outline"
      ? "border border-white/20 bg-transparent hover:bg-white/10"
      : "bg-[#8e2afc] hover:bg-[#7b1fe0]";
  return (
    <button className={`${base} ${styles} ${className}`} disabled={loading} {...rest}>
      {loading ? "..." : children}
    </button>
  );
}
function LocalCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-extrabold tracking-tight text-[#8e2afc] flex items-center gap-2">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
function SuccessModal({
  open,
  title,
  subtitle,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm">
      <div className="max-w-md rounded-md bg-neutral-900 p-6 text-center shadow-lg">
        <h2 className="mb-2 text-2xl font-semibold text-green-400">{title}</h2>
        {subtitle && <p className="text-white/70">{subtitle}</p>}
        <button
          className="mt-6 rounded bg-[#8e2afc] px-4 py-2 text-sm font-medium hover:bg-[#7b1fe0]"
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

/* =========================================================
 * Coerciones seguras (no tocan tu UI ni tu schema)
 * =======================================================*/
const asBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === "si" || s === "sí" || s === "true" || s === "1";
};
const asInt = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
/** tu select de VIP hoy guarda "No" | "1" | ... | "Más de 5" */
const vipToCount = (v: unknown): number => {
  const s = String(v);
  if (s.toLowerCase() === "no" || s === "" || s === "0") return 0;
  if (s.toLowerCase().includes("más de")) return 6; // puedes ajustar
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const vipToBool = (v: unknown): boolean => vipToCount(v) > 0;

/* =========================================================
 * Página
 * =======================================================*/
export default function EventPage() {
  return <EventWizard />;
}

function EventWizard() {
  const methods = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema) as unknown as Resolver<EventFormValues>,
    defaultValues: defaultEventValues,
    mode: "onChange",
  });

  const [loadingStep, setLoadingStep] = useState(false);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  const steps = useSteps();
  const { current, total, next, prev } = useStepper(steps);
  const navigate = useNavigate();

  // Campos por paso (agrego "reservas" aquí; saco "vip" que no usas)
  const stepFields: Keys[][] = [
    ["nombre", "tipo"], // 0
    ["fecha", "horaInicio", "horaCierre"], // 1
    ["capacidad"], // 2
    ["promotor", "telefono", "email"], // 3
    ["desc", "generos"], // 4
    ["edad", "dress_code", "tieneVip", "reservas", "tieneLineup", "djs"], // 5
    ["flyer", "imgSec"], // 6
    [], // review
  ];

  const onSubmitStep = async () => {
    const fields = stepFields[current];
    const ok = await methods.trigger(fields, { shouldFocus: true });
    if (!ok) {
      const msgs = collectStepErrors(methods.formState.errors, fields);
      setStepErrors(msgs);
      toast.error(msgs[0] ?? "Corrige los campos para continuar.");
      return;
    }
    setStepErrors([]);
    toast.success("Paso guardado ✅");
    next();
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const onSubmitFinal = async (data: EventFormValues) => {
    if (sent) return;
    try {
      setLoadingStep(true);

      // 1) usuario
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) throw new Error("No estás autenticado");

      // 2) id_usuario
      const { data: usuarioData, error: usuarioError } = await supabase
        .from("usuario")
        .select("id_usuario")
        .eq("auth_user_id", user.id)
        .single();
      if (usuarioError || !usuarioData) throw new Error("No se encontró tu perfil");

      const id_usuario = usuarioData.id_usuario;

      // 3) subir imágenes
      const uploadImage = async (file: File | null, folder: string) => {
        if (!file) return null;
        const filePath = `${folder}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage
          .from("evento")
          .upload(filePath, file, { cacheControl: "3600", upsert: false });
        if (error) throw new Error(`Error al subir ${folder}: ${error.message}`);
        return supabase.storage.from("evento").getPublicUrl(filePath).data.publicUrl;
      };

      const flyerUrl = await uploadImage(data.flyer, "flyer");
      const imgSecUrl = await uploadImage(data.imgSec, "imgSec");

      // 4) normalizar lineup / edades / booleans
      const cleanedDJs = (data.djs || [])
        .map((dj) => (dj ?? "").toString().trim())
        .filter(Boolean);

      // ⚠️ armamos un payload limpio para tu tabla "evento"
      const payload = {
        // campos tal cual del form
        nombre: data.nombre,
        tipo: data.tipo,
        fecha: data.fecha,
        horaInicio: data.horaInicio,
        horaCierre: data.horaCierre,
        capacidad: data.capacidad,
        presupuesto: data.presupuesto,
        promotor: data.promotor,
        telefono: data.telefono,
        email: data.email,
        desc: data.desc,
        generos: data.generos,

        // normalizados
        edad: asInt(data.edad, 18),
        dress_code: data.dress_code,

        // VIP: derivamos cantidad y boolean
        tieneVip: vipToBool(data.tieneVip),
        cantidadZonasVip: vipToCount(data.tieneVip),

        // reservas / lineup como boolean + derivados
        aceptaReservas: asBool(data.reservas), // ⬅️ si tu columna se llama `reservas`, cámbialo por `reservas: asBool(data.reservas)`
        tieneLineup: asBool(data.tieneLineup),
        cantidadDJs: cleanedDJs.length,
        djs: cleanedDJs,

        // imágenes + FK
        flyer: flyerUrl,
        imgSec: imgSecUrl,
        id_usuario,
      };

      console.log("Payload evento a insertar:", payload);

      // 5) insertar evento
      const { error: insertError } = await supabase.from("evento").insert([payload]);
      if (insertError) throw new Error(insertError.message);

      toast.success("¡Evento creado con éxito!");
      setSent(true);
      methods.reset(defaultEventValues);
      setTimeout(() => navigate("/mis-eventos"), 1800);
    } catch (err) {
      toast.error((err as Error).message ?? "Error inesperado");
    } finally {
      setLoadingStep(false);
    }
  };

  return (
    <main className="relative min-h-screen text-white px-4 py-8 overflow-x-hidden">
      <header className="max-w-3xl mx-auto space-y-2 mb-8 text-center">
        <img src={logo} alt="GoUp" className="mx-auto w-28" />
        <h1 className="text-3xl md:text-4xl font-extrabold">
          CREAR <span className="text-[#8e2afc]">EVENTO</span> NOCTURNO
        </h1>
        <p className="text-white/70">Organiza la experiencia nocturna perfecta con GoUp</p>
      </header>

      <FormProvider {...methods}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (current === total - 1) {
              methods.handleSubmit(onSubmitFinal)();
            } else {
              onSubmitStep();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          className="max-w-3xl mx-auto space-y-8 mt-8"
          noValidate
        >
          <StepDots step={current} total={total} />
          <StepErrorBanner errors={stepErrors} />

          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {steps[current].content}
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-between pt-6">
            {current > 0 ? (
              <LoadingButton type="button" variant="outline" onClick={prev}>
                Atrás
              </LoadingButton>
            ) : (
              <span />
            )}

            <LoadingButton type="submit" loading={loadingStep}>
              {current === total - 1 ? "Enviar formulario" : "Siguiente"}
            </LoadingButton>
          </div>
        </form>
      </FormProvider>

      <SuccessModal
        open={sent}
        title="¡Evento enviado!"
        subtitle="Nos pondremos en contacto contigo pronto."
        onClose={() => setSent(false)}
      />
    </main>
  );
}

/* =========================================================
 * Steps — tus mismos bloques
 * =======================================================*/
function useSteps() {
  return [
    {
      icon: "🎵",
      title: "Información del Evento",
      content: (
        <LocalCard title="Información del Evento">
          <RHFInput
            name="nombre"
            label="Nombre del Evento *"
            placeholder="Ej: PURPLE NIGHTS • MIDNIGHT VIBES"
          />
          <RHFSelect
            name="tipo"
            label="Tipo de Evento *"
            options={["Club", "Festival", "After", "Privado", "Open Air", "Bar"]}
            placeholder="Selecciona el tipo"
          />
        </LocalCard>
      ),
    },
    {
      icon: "🕒",
      title: "Fecha & Horario",
      content: (
        <LocalCard title="Fecha & Horario">
          <RHFInput name="fecha" type="date" label="Fecha del Evento *" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RHFInput name="horaInicio" type="time" label="Hora de Inicio *" />
            <RHFInput name="horaCierre" type="time" label="Hora de Cierre *" />
          </div>
        </LocalCard>
      ),
    },
    {
      icon: "👥",
      title: "Capacidad",
      content: (
        <LocalCard title="Capacidad">
          <RHFSelect
            name="capacidad"
            label="Capacidad esperada *"
            placeholder="Selecciona una opción"
            options={["0 a 200", "201 a 500", "501 a 1000", "1001 a 2000", "Más de 2000"]}
          />
        </LocalCard>
      ),
    },
    {
      icon: "📞",
      title: "Contacto organizador",
      content: (
        <LocalCard title="Contacto organizador">
          <RHFInput name="promotor" label="Nombre del Promotor *" placeholder="Tu nombre o nombre artístico" />
          <RHFInput name="telefono" label="WhatsApp/Teléfono *" placeholder="+56 9 1234 5678" />
          <RHFInput name="email" type="email" label="Email *" placeholder="promotor@goup.com" />
        </LocalCard>
      ),
    },
    {
      icon: "✨",
      title: "Concepto & Experiencia",
      content: (
        <LocalCard title="Concepto & Experiencia">
          <RHFTextarea
            name="desc"
            label="Describe la atmósfera, música, efectos especiales, dress code, etc. *"
            rows={5}
            placeholder="Género musical, DJ lineup, luces, máquinas de humo, dress code, ..."
          />
          <RHFCheckboxGroup name="generos" label="Géneros musicales (puedes elegir varios) *" options={[...generosMusicales]} />
        </LocalCard>
      ),
    },
    {
      icon: "🧾",
      title: "Políticas del evento",
      content: (
        <LocalCard title="Políticas del evento">
          <RHFSelect
            name="edad"
            label="Edad mínima para el ingreso *"
            options={Array.from({ length: 53 }, (_, i) => `${i + 18}`)}
            placeholder="Selecciona edad mínima"
          />
          <RHFSelect
            name="dress_code"
            label="Código de vestimenta *"
            options={["Casual", "Formal", "Semi-formal", "Urbano", "Fiesta temática"]}
            placeholder="Selecciona el código"
          />
          <RHFSelect
            name="tieneVip"
            label="¿Tiene zonas VIP?"
            options={["No", "1", "2", "3", "4", "5", "Más de 5"]}
          />
          <RHFSelect name="reservas" label="¿Acepta reservas?" options={["Sí", "No"]} />
          <RHFSelect name="tieneLineup" label="¿Tendrá DJs con line-up?" options={["Sí", "No"]} />
          <LineupFields />
        </LocalCard>
      ),
    },
    {
      icon: "🛡️",
      title: "Flyer & Seguridad",
      content: (
        <LocalCard title="Flyer & Seguridad">
          <RHFFile name="flyer" label="Flyer del evento" />
          <RHFFile name="imgSec" label="Imagen secundaria (opcional)" />
        </LocalCard>
      ),
    },
    {
      icon: "✅",
      title: "Revisión",
      content: (
        <LocalCard title="Revisión final">
          <p className="text-sm text-white/70">Revisa que toda la información sea correcta antes de enviar.</p>
        </LocalCard>
      ),
    },
  ] as const;
}