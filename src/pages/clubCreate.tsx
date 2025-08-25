// src/pages/clubCreate.tsx
import React, { useState } from "react";
import { useForm, FormProvider, type FieldPath } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useStepper } from "@/hooks/useStepper";
import { useAuth } from "@/auth/AuthContext";

// ⬇️ IMPORT CORRECTO (default) DEL COMPONENTE
import AddressMapInputGoogle from "@/components/form/AddressMapInputGoogle";

import {
  RHFInput,
  RHFTextarea,
  RHFSelect,
  RHFFile,
  StepErrorBanner,
} from "@/components/form/control";
import logo from "@/assets/goup_logo.png";

import {
  collection,
  doc,
  query,
  where,
  getDocs,
  setDoc,
  Firestore,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { db as firebaseDb } from "@/lib/firebase";

/** 1) Esquema y tipos */
const clubSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  descripcion: z.string().min(1, "La descripción es obligatoria"),
  direccion: z.string().min(1, "La dirección es obligatoria"),
  ciudad: z.string().min(1, "La ciudad es obligatoria"),
  pais: z.string().min(1, "El país es obligatorio"),
  latitud: z.number().optional().nullable(),
  longitud: z.number().optional().nullable(),
  telefono: z.string().optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  sitio_web: z.string().url("URL inválida").optional().or(z.literal("")),
  instagram: z.string().optional().or(z.literal("")),
  imagen: z.any().nullable(),
  banner: z.any().nullable(),
  accesibilidad: z.union([z.boolean(), z.enum(["Sí", "No"])]).default("No"),
  estacionamientos: z.union([z.boolean(), z.enum(["Sí", "No"])]).default("No"),
  guardaropia: z.union([z.boolean(), z.enum(["Sí", "No"])]).default("No"),
  terraza: z.union([z.boolean(), z.enum(["Sí", "No"])]).default("No"),
  fumadores: z.union([z.boolean(), z.enum(["Sí", "No"])]).default("No"),
  wifi: z.union([z.boolean(), z.enum(["Sí", "No"])]).default("No"),
  ambientes: z.union([z.number(), z.string()]).optional().or(z.literal("")),
  banos: z.union([z.number(), z.string()]).optional().or(z.literal("")),
});
export type ClubFormValues = z.infer<typeof clubSchema>;

/** 2) Valores por defecto */
const defaultClubValues: ClubFormValues = {
  nombre: "",
  descripcion: "",
  direccion: "",
  ciudad: "",
  pais: "",
  latitud: null,
  longitud: null,
  telefono: "",
  email: "",
  sitio_web: "",
  instagram: "",
  imagen: null,
  banner: null,
  accesibilidad: "No",
  estacionamientos: "No",
  guardaropia: "No",
  terraza: "No",
  fumadores: "No",
  wifi: "No",
  ambientes: "",
  banos: "",
};

/** 3) Pasos del wizard */
type Step = { icon: string; title: string; content: React.ReactNode };
function useSteps(locks: { city: boolean; country: boolean }): Step[] {
  return [
    {
      icon: "🏷️",
      title: "Identidad & contacto",
      content: (
        <LocalCard title="Identidad & contacto">
          <RHFInput name="nombre" label="Nombre del club *" />
          <RHFTextarea name="descripcion" label="Descripción *" rows={4} />

          {/* Autocompletar Google + mapa */}
          <AddressMapInputGoogle
            onLock={(l) => {
              // l.city / l.country true => bloquear inputs
              // La asignación la hace el padre (ClubWizard) via setLocks()
            }}
          />

          <div className="grid md:grid-cols-2 gap-4">
            {/* Estos disabled los setea el padre vía props; ver ClubWizard abajo */}
            <RHFInput name="ciudad" label="Ciudad *" disabled={locks.city} />
            <RHFInput name="pais" label="País *" disabled={locks.country} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <RHFInput name="telefono" label="Teléfono" />
            <RHFInput name="email" label="Email" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <RHFInput name="sitio_web" label="Sitio web" />
            <RHFInput name="instagram" label="Instagram" />
          </div>
        </LocalCard>
      ),
    },
    {
      icon: "🖼️",
      title: "Medios",
      content: (
        <LocalCard title="Medios">
          <RHFFile name="imagen" label="Imagen principal" />
          <RHFFile name="banner" label="Banner" />
        </LocalCard>
      ),
    },
    {
      icon: "🧩",
      title: "Servicios & capacidades",
      content: (
        <LocalCard title="Servicios & capacidades">
          <div className="grid md:grid-cols-2 gap-4">
            <RHFSelect name="accesibilidad" label="Accesibilidad" options={["Sí", "No"]} />
            <RHFSelect name="estacionamientos" label="Estacionamientos" options={["Sí", "No"]} />
            <RHFSelect name="guardaropia" label="Guardarropía" options={["Sí", "No"]} />
            <RHFSelect name="terraza" label="Terraza" options={["Sí", "No"]} />
            <RHFSelect name="fumadores" label="Zona de fumadores" options={["Sí", "No"]} />
            <RHFSelect name="wifi" label="Wi‑Fi" options={["Sí", "No"]} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <RHFInput name="ambientes" type="number" label="Ambientes" placeholder="Ej: 3" />
            <RHFInput name="banos" type="number" label="Baños" placeholder="Ej: 2" />
          </div>
        </LocalCard>
      ),
    },
  ];
}

/** Componentes auxiliares */
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
function LoadingButton({
  loading,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      className="inline-flex items-center justify-center rounded-md bg-[#8e2afc] px-4 py-2 text-sm font-medium hover:bg-[#7b1fe0] disabled:opacity-50"
      disabled={loading}
      {...rest}
    >
      {loading ? "Procesando…" : children}
    </button>
  );
}
function LocalCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-extrabold text-[#8e2afc] flex items-center gap-2">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Página principal */
export default function ClubCreatePage() {
  return <ClubWizard />;
}

function ClubWizard() {
  const methods = useForm<ClubFormValues>({
    resolver: zodResolver(clubSchema),
    defaultValues: defaultClubValues,
    mode: "onChange",
  });

  // ⬇️ Locks para ciudad/país
  const [locks, setLocks] = useState<{ city: boolean; country: boolean }>({
    city: false,
    country: false,
  });

  // Pasamos locks a los pasos para que deshabiliten inputs
  const steps = useSteps(locks);

  const { current: step, total, next, prev } = useStepper(steps);
  const [loadingStep, setLoadingStep] = useState(false);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Inyectamos onLock en el primer paso una vez montado
  // (Truco simple: sustituimos el nodo AddressMapInputGoogle con un clon que incluya onLock)
  steps[0].content = (
    <LocalCard title="Identidad & contacto">
      <RHFInput name="nombre" label="Nombre del club *" />
      <RHFTextarea name="descripcion" label="Descripción *" rows={4} />
      <AddressMapInputGoogle
        onLock={(l) => setLocks(l)}
      />
      <div className="grid md:grid-cols-2 gap-4">
        <RHFInput name="ciudad" label="Ciudad *" disabled={locks.city} />
        <RHFInput name="pais" label="País *" disabled={locks.country} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <RHFInput name="telefono" label="Teléfono" />
        <RHFInput name="email" label="Email" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <RHFInput name="sitio_web" label="Sitio web" />
        <RHFInput name="instagram" label="Instagram" />
      </div>
    </LocalCard>
  );

  const stepFields: FieldPath<ClubFormValues>[][] = [
    ["nombre", "descripcion", "direccion", "ciudad", "pais", "telefono", "email", "sitio_web", "instagram"],
    ["imagen", "banner"],
    ["accesibilidad", "estacionamientos", "guardaropia", "terraza", "fumadores", "wifi", "ambientes", "banos"],
  ];

  const onNext = async () => {
    const fields = stepFields[step] || [];
    const ok = await methods.trigger(fields, { shouldFocus: true });
    if (!ok) {
      const errs = (fields as FieldPath<ClubFormValues>[])
        .map((f) => {
          const err = methods.formState.errors[f as keyof typeof methods.formState.errors];
          return err?.message as string | undefined;
        })
        .filter((m): m is string => Boolean(m));
      setStepErrors(errs);
      toast.error(errs[0] || "Corrige los campos para continuar.");
      return;
    }
    setStepErrors([]);
    next();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Submit final: guarda en Firestore */
  const onSubmitFinal = methods.handleSubmit(async (data) => {
    if (sent) return;
    if (!user?.uid) {
      toast.error("Debes iniciar sesión");
      return;
    }
    setLoadingStep(true);

    try {
      // Validación de único club por usuario (según tu lógica)
      const clubesCol = collection(firebaseDb as Firestore, "club");
      const userCol = collection(firebaseDb as Firestore, "usersWeb");
      const q = query(clubesCol, where("uid_usersWeb", "==", user.uid));
      const p = query(userCol, where("rol", "==", "club_owner"));
      const val = await getDocs(p);
      const snap = await getDocs(q);

      if (!snap.empty && val.empty) {
        toast.error("Ya tienes un club creado.");
        navigate("/dashboard/mi-club");
        return;
      }

      // Subida de archivos
      const upload = async (file: File | null, folder: string) => {
        if (!file) return null;
        const storage = getStorage();
        const ext = file.name.split(".").pop() || "jpg";
        const path = `club/${user.uid}/${folder}/${Date.now()}.${ext}`;
        const ref = storageRef(storage, path);
        await uploadBytes(ref, file);
        return getDownloadURL(ref);
      };
      const imagenUrl = await upload(data.imagen as File | null, "imagen");
      const bannerUrl = await upload(data.banner as File | null, "banner");

      const idClub = Date.now();

      const payload = {
        id_club: idClub,
        uid_usersWeb: user.uid,
        nombre: data.nombre,
        descripcion: data.descripcion,
        direccion: data.direccion,
        ciudad: data.ciudad,
        pais: data.pais,
        latitud: typeof data.latitud === "number" ? data.latitud : null,
        longitud: typeof data.longitud === "number" ? data.longitud : null,
        telefono: data.telefono || null,
        email: data.email || null,
        sitio_web: data.sitio_web || null,
        instagram: data.instagram || null,
        imagen: imagenUrl,
        banner: bannerUrl,
        accesibilidad: data.accesibilidad === true || data.accesibilidad === "Sí",
        estacionamientos: data.estacionamientos === true || data.estacionamientos === "Sí",
        guardaropia: data.guardaropia === true || data.guardaropia === "Sí",
        terraza: data.terraza === true || data.terraza === "Sí",
        fumadores: data.fumadores === true || data.fumadores === "Sí",
        wifi: data.wifi === true || data.wifi === "Sí",
        ambientes: Number(data.ambientes) || 0,
        banos: Number(data.banos) || 0,
        seguidores: 0,
        seguridad: false,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(clubesCol), payload);
      toast.success("¡Club creado con éxito!");
      setSent(true);
      methods.reset(defaultClubValues);
      navigate("/dashboard/mi-club");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al crear el club");
    } finally {
      setLoadingStep(false);
    }
  });

  return (
    <main className="px-4 py-8 ">
      <header className="text-center space-y-2 mb-8">
        <img src={logo} alt="GoUp" className="mx-auto w-28" />
        <h1 className="text-3xl font-extrabold">
          CREAR <span className="text-[#8e2afc]">CLUB</span>
        </h1>
        <p className="/70">Publica tu club con fotos y detalles.</p>
      </header>

      <FormProvider {...methods}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            step === total - 1 ? onSubmitFinal() : onNext();
          }}
          noValidate
          className="max-w-3xl mx-auto space-y-8"
        >
          <StepDots step={step} total={total} />
          <StepErrorBanner errors={stepErrors} />

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {steps[step].content}
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-between">
            {step > 0 ? (
              <LoadingButton type="button" onClick={prev}>
                Atrás
              </LoadingButton>
            ) : (
              <span />
            )}
            <LoadingButton loading={loadingStep} type="submit">
              {step === total - 1 ? "Crear club" : "Siguiente"}
            </LoadingButton>
          </div>
        </form>
      </FormProvider>
    </main>
  );
}