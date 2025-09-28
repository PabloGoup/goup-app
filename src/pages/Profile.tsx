// src/pages/Profile.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useFormContext, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";

import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { updateProfile } from "firebase/auth";

import { useAuth } from "@/auth/AuthContext";
import { db as firebaseDb, auth as firebaseAuth } from "@/lib/firebase";
import { MAIN_GENRES, ALL_SUBGENRES } from "@/lib/musicGenres";

// Inputs
import { RHFInput, RHFFile } from "@/components/form/control";
import { useWatch } from "react-hook-form";

// =========================
// Regiones y ciudades de Chile
// =========================
const REGIONES_CHILE: { value: string; label: string }[] = [
  { value: "Arica y Parinacota", label: "Arica y Parinacota" },
  { value: "Tarapacá", label: "Tarapacá" },
  { value: "Antofagasta", label: "Antofagasta" },
  { value: "Atacama", label: "Atacama" },
  { value: "Coquimbo", label: "Coquimbo" },
  { value: "Valparaíso", label: "Valparaíso" },
  { value: "Metropolitana de Santiago", label: "Metropolitana de Santiago" },
  { value: "O'Higgins", label: "O'Higgins" },
  { value: "Maule", label: "Maule" },
  { value: "Ñuble", label: "Ñuble" },
  { value: "Biobío", label: "Biobío" },
  { value: "La Araucanía", label: "La Araucanía" },
  { value: "Los Ríos", label: "Los Ríos" },
  { value: "Los Lagos", label: "Los Lagos" },
  { value: "Aysén", label: "Aysén" },
  { value: "Magallanes y Antártica", label: "Magallanes y Antártica" },
];

const CIUDADES_POR_REGION: Record<string, string[]> = {
  "Arica y Parinacota": ["Arica", "Putre"],
  "Tarapacá": ["Iquique", "Alto Hospicio", "Pozo Almonte"],
  "Antofagasta": ["Antofagasta", "Calama", "Tocopilla"],
  "Atacama": ["Copiapó", "Vallenar"],
  "Coquimbo": ["La Serena", "Coquimbo", "Ovalle"],
  "Valparaíso": ["Valparaíso", "Viña del Mar", "Quilpué", "Quillota", "San Antonio"],
  "Metropolitana de Santiago": ["Santiago", "Puente Alto", "Maipú", "Ñuñoa", "Providencia", "Las Condes", "La Florida"],
  "O'Higgins": ["Rancagua", "San Fernando"],
  "Maule": ["Talca", "Curicó", "Linares"],
  "Ñuble": ["Chillán", "San Carlos"],
  "Biobío": ["Concepción", "Talcahuano", "Los Ángeles", "Coronel"],
  "La Araucanía": ["Temuco", "Padre Las Casas", "Villarrica"],
  "Los Ríos": ["Valdivia", "La Unión", "Río Bueno"],
  "Los Lagos": ["Puerto Montt", "Osorno", "Castro"],
  "Aysén": ["Coyhaique", "Puerto Aysén"],
  "Magallanes y Antártica": ["Punta Arenas", "Puerto Natales"],
};

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

// Iconos
import { CalendarDays, CheckCircle2, Clock3, User2 } from "lucide-react";
import { Link } from "react-router-dom";

import ModalConfirm from "@/components/ModalConfirm";

/* =========================
 * Validación
 * ========================= */
const profileSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  phone_number: z.string().optional().or(z.literal("")),
  rut: z.string().optional().or(z.literal("")),
  direccion: z.string().optional().or(z.literal("")),
  sexo: z.string().optional().or(z.literal("")),
  fecha_nacimiento: z.string().optional().or(z.literal("")),
  photo_url: z.any().optional().nullable(),
  // Preferencias (simplificadas)
  city_region: z.string().optional().or(z.literal("")),
  city_base: z.string().optional().or(z.literal("")),
  search_radius_km: z.coerce.number().min(1, "El radio mínimo es 1 km").optional().nullable(),
  fav_main_genres: z.array(z.string()).optional().default([]),
  // Notificaciones (puede quedar en schema aunque no se muestre en UI)
  noti_push: z.boolean().optional().default(true),
});
type ProfileForm = z.infer<typeof profileSchema>;

/* =========================
 * RHF Select (shadcn)
 * ========================= */
function RHFSelectShadcn({
  name,
  label,
  placeholder = "Selecciona una opción",
  options,
}: {
  name: string;
  label: string;
  placeholder?: string;
  options: { value: string; label: string }[];
}) {
  const { control, formState } = useFormContext();
  const error = (formState.errors as any)?.[name]?.message as string | undefined;

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-foreground">{label}</label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select onValueChange={field.onChange} value={field.value ?? ""}>
            <SelectTrigger className="w-full bg-white/5 border border-white/15">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[100] bg-neutral-900 border border-white/10 text-foreground">
              {options.map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}

/* =========================
 * RHF Helpers (MultiSelect)
 * ========================= */
function RHFMultiSelect({
  name,
  label,
  options,
  placeholder = "Selecciona...",
  size = 6,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  size?: number;
}) {
  const { control, formState } = useFormContext();
  const error = (formState.errors as any)?.[name]?.message as string | undefined;
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-foreground">{label}</label>
      <Controller
        control={control}
        name={name}
        render={
          // --- Toggle chips UI ---
          ({ field }) => (
            <>
              {/* Toggle chips */}
              <div className="flex flex-wrap gap-2">
                {(options || []).map((op) => {
                  const selected: string[] = Array.isArray(field.value) ? field.value : [];
                  const isActive = selected.includes(op.value);
                  return (
                    <button
                      key={op.value}
                      type="button"
                      className={`px-2 py-1 rounded-full text-xs border transition ${
                        isActive
                          ? "bg-[#FE8B02]/20 border-[#FE8B02]/50 text-white"
                          : "bg-white/5 border-white/15 text-white/80 hover:bg-[#FE8B02]/10"
                      }`}
                      aria-pressed={isActive}
                      onClick={() => {
                        const curr: string[] = Array.isArray(field.value) ? field.value : [];
                        const next = isActive
                          ? curr.filter((v) => v !== op.value)
                          : [...curr, op.value];
                        field.onChange(next);
                      }}
                    >
                      {op.label}
                    </button>
                  );
                })}
              </div>

              {/* Hidden input */}
              <input type="hidden" name={name} value={(Array.isArray(field.value) ? field.value : []).join(',')} readOnly />

              {/* Selected chips preview */}
              {Array.isArray(field.value) && field.value.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {field.value.map((val: string) => {
                    const label = options.find((o) => o.value === val)?.label ?? val;
                    return (
                      <span
                        key={val}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border border-white/15 bg-white/5"
                      >
                        {label}
                        <button
                          type="button"
                          onClick={() => {
                            const curr: string[] = Array.isArray(field.value) ? field.value : [];
                            field.onChange(curr.filter((v) => v !== val));
                          }}
                          aria-label={`Quitar ${label}`}
                          className="ml-1 rounded-full border border-white/20 hover:bg-white/10 px-1 leading-none"
                          title="Quitar"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </>
          )
        }
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <p className="text-xs text-muted-foreground">{placeholder}</p>
    </div>
  );
}

/* =========================
 * Badges de stats (estética artista)
 * ========================= */
function StatBadge({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  const classes =
    "inline-flex items-center gap-2 rounded-full border border-[#FE8B02]/30 bg-[#FE8B02]/10 px-3 py-1 transition hover:bg-[#FE8B02]/15";
  const inner = (
    <>
      <Icon className="h-4 w-4 text-[#FE8B02]" />
      <span className="text-xs text-foreground/80">{label}:</span>
      <span className="text-xs font-semibold">{value}</span>
    </>
  );
  return href ? (
    <Link to={href} className={classes} aria-label={`${label}: ${value}`}>
      {inner}
    </Link>
  ) : (
    <div className={classes}>{inner}</div>
  );
}

/* =========================
 * Página
 * ========================= */
export default function ProfilePage() {
  const { user, dbUser, loading: authLoading, signOut } = useAuth();

  const [loadingPage, setLoadingPage] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [record, setRecord] = useState<any>(null);
  const originalRef = useRef<ProfileForm | null>(null);

  // Contadores basados en tickets y favoritos
  const [totalTickets, setTotalTickets] = useState(0);
  const [usedTickets, setUsedTickets] = useState(0);
  const [upcomingTickets, setUpcomingTickets] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);

  const methods = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: undefined,
    mode: "onChange",
  });

  /* = Carga de perfil = */
  useEffect(() => {
    (async () => {
      if (authLoading) return;
      if (!user?.uid) {
        setLoadingPage(false);
        return;
      }
      try {
        const userRef = doc(firebaseDb as Firestore, "usersWeb", user.uid);
        const snap = await getDoc(userRef);
        const data = snap.exists()
          ? snap.data()
          : {
              uid: user.uid,
              email: user.email,
              nombre: user.displayName,
              phone_number: "",
              rut: "",
              direccion: "",
              sexo: "",
              fecha_nacimiento: "",
              photo_url: user.photoURL,
            };
        setRecord(data);

        const pref = {
          city_region: data.city_region ?? "",
          city_base: data.city_base ?? "",
          search_radius_km: typeof data.search_radius_km === "number" ? data.search_radius_km : 20,
          fav_main_genres: Array.isArray(data.fav_main_genres) ? data.fav_main_genres : [],
          noti_push: data.noti_push ?? true,
        } as const;
        const defaults: ProfileForm = {
          nombre: data.nombre ?? "",
          phone_number: data.phone_number ?? "",
          rut: data.rut ?? "",
          direccion: data.direccion ?? "",
          sexo: typeof data.sexo === "string" ? data.sexo : "",
          fecha_nacimiento: data.fecha_nacimiento?.seconds
            ? new Date(data.fecha_nacimiento.seconds * 1000).toISOString().split("T")[0]
            : data.fecha_nacimiento ?? "",
          photo_url: null,
          ...pref,
        } as any;
        methods.reset(defaults);
        originalRef.current = defaults;
      } catch (e) {
        console.error(e);
        toast.error("No se pudo cargar tu perfil");
      } finally {
        setLoadingPage(false);
      }
    })();
  }, [authLoading, user, methods]);

  /* = Estadísticas: tickets comprados / usados / por asistir + favoritos = */
  useEffect(() => {
    (async () => {
      if (!record?.uid) return;
      try {
        // ---- Tickets del comprador actual ----
        const tq = query(
          collection(firebaseDb as Firestore, "tickets"),
          where("buyerUid", "==", record.uid)
        );
        const tsnap = await getDocs(tq);
        const tickets = tsnap.docs.map((d) => d.data() as any);

        const now = Date.now();
        setTotalTickets(tickets.length);

        // usados (checked-in/used)
        const used = tickets.filter((t) => {
          const s = String(t.status || "").toLowerCase();
          return s === "used" || s === "checked_in" || s === "checkedin" || s === "escaneado";
        }).length;
        setUsedTickets(used);

        // por asistir (no usados, no cancelados/refundados y, si hay fecha, que no haya pasado)
        const upcoming = tickets.filter((t) => {
          const s = String(t.status || "").toLowerCase();
          if (s === "used" || s === "checked_in" || s === "checkedin" || s === "escaneado") return false;
          if (s === "cancelled" || s === "canceled" || s === "refunded") return false;

          const end =
            t.eventEnd ||
            t.event_end ||
            t.eventDate ||
            t.event_start ||
            null;

          let endMs: number | null = null;
          if (typeof end === "string") {
            const parsed = Date.parse(end);
            endMs = Number.isNaN(parsed) ? null : parsed;
          } else if (end?.seconds) {
            endMs = end.seconds * 1000;
          }

          if (endMs != null && endMs < now) return false;
          return true;
        }).length;
        setUpcomingTickets(upcoming);

        // ---- Favoritos (compatibilidad con distintos esquemas) ----
        let favCount = 0;

        // Opción A: colección global "favs"
        try {
          const favQ = query(
            collection(firebaseDb as Firestore, "favs"),
            where("uid", "==", record.uid)
          );
          const favSnap = await getDocs(favQ);
          favCount = Math.max(favCount, favSnap.size);
        } catch {}

        // Opción B: colección global "favorites"
        try {
          const favQ2 = query(
            collection(firebaseDb as Firestore, "favorites"),
            where("uid", "==", record.uid)
          );
          const favSnap2 = await getDocs(favQ2);
          favCount = Math.max(favCount, favSnap2.size);
        } catch {}

        // Opción C: subcolección en el usuario
        try {
          const favSubSnap = await getDocs(
            collection(firebaseDb as Firestore, `usersWeb/${record.uid}/favorites`)
          );
          favCount = Math.max(favCount, favSubSnap.size);
        } catch {}

        setFavoritesCount(favCount);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [record]);

  /* = Helpers = */
  const avatarUrl = useMemo(() => record?.photo_url ?? "", [record]);

  const uploadAvatar = async (file: File): Promise<string> => {
    const storage = getStorage();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `avatars/${user!.uid}/avatar.${ext}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    return await getDownloadURL(ref);
  };

  const handleCancel = () => {
    if (originalRef.current) methods.reset(originalRef.current);
    setEditMode(false);
  };

  const onConfirmSave = methods.handleSubmit(async (values) => {
    if (!user?.uid || !record) return;
    setSaving(true);
    try {
      let photoURL = record.photo_url;
      if (values.photo_url instanceof File) {
        photoURL = await uploadAvatar(values.photo_url);
        await updateProfile(firebaseAuth.currentUser!, { photoURL });
      }

      const payload: any = {
        ...record,
        ...values,
        ...(values.sexo && values.sexo !== "" ? { sexo: values.sexo } : {}),
        photo_url: photoURL || null,
      };
      if (!payload.photo_url) delete payload.photo_url;
      if (!payload.sexo) delete payload.sexo;

      const userRef = doc(firebaseDb as Firestore, "usersWeb", user.uid);
      const exists = (await getDoc(userRef)).exists();
      if (exists) await updateDoc(userRef, payload);
      else await setDoc(userRef, payload);

      await updateProfile(firebaseAuth.currentUser!, { displayName: values.nombre });

      setRecord(payload);
      methods.reset({ ...values, photo_url: null });
      originalRef.current = { ...values, photo_url: null };
      toast.success("Perfil actualizado");
      setEditMode(false);
      setConfirmOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  });

  const displayName = record?.nombre || "Usuario";
  const email = record?.email || "";
  const fechaNacimientoFormateada = record?.fecha_nacimiento?.seconds
    ? new Date(record.fecha_nacimiento.seconds * 1000).toISOString().split("T")[0]
    : record?.fecha_nacimiento || "";

  const displayRol = (rol: string) => {
    switch (rol) {
      case "admin":
        return "Administrador";
      case "club_owner":
        return "Administrador de Club";
      case "productor":
        return "Administrador de Productora";
      default:
        return "Usuario pendiente de evaluación";
    }
  };

  if (loadingPage || !record) {
    return <p className="mt-10 text-center text-foreground">Cargando perfil...</p>;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ===== HERO estilo Artista (blur + máscaras + gradientes) ===== */}
      <section className="relative isolate w-full overflow-visible mb-0">
        <div
          className="pointer-events-none absolute -inset-x-40 -top-32 -bottom-32 -z-10 overflow-visible"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
            maskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
          }}
        >
          {avatarUrl ? (
            <>
              <img
                src={avatarUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover scale-[1.35] blur-[72px] opacity-[0.55]"
              />
              <div className="absolute inset-0 [background:radial-gradient(1200px_560px_at_64%_32%,rgba(0,0,0,0)_0%,rgba(0,0,0,.55)_60%,rgba(0,0,0,.98)_100%)]" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black/80" />
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-gradient-to-br from-[#FE8B02] via-[#FF6A03] to-[#FF3403]" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black/80" />
            </>
          )}
        </div>

        {/* Contenido del hero */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 pt-8 md:pt-12 pb-10 md:pb-14">
          <div className="grid gap-8 md:gap-10 md:grid-cols-[300px_1fr] items-end">
            {/* Avatar con aro */}
            <figure className="relative w-[200px] md:w-[260px] aspect-square rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
              <div className="relative w-full aspect-square rounded-2xl ring-4 ring-[#FE8B02]/40 overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" loading="eager" />
                ) : (
                  <div className="grid w-full h-full place-items-center text-6xl">
                    {displayName[0]?.toUpperCase() ?? "U"}
                  </div>
                )}
              </div>
            </figure>

            {/* Meta + acciones */}
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">{displayName}</h1>
              </div>
              {email && <p className="mt-1 text-white/80">{email}</p>}

              {/* Badges */}
              <div className="mt-4 flex flex-wrap gap-2">
                <StatBadge icon={CheckCircle2} label="Asistidos" value={usedTickets} href="/mis-tickets?tab=used" />
                <StatBadge icon={CalendarDays} label="Tickets comprados" value={totalTickets} href="/mis-tickets?tab=all" />
                <StatBadge icon={Clock3} label="Por asistir" value={upcomingTickets} href="/mis-tickets?tab=upcoming" />
                <StatBadge icon={User2} label="Favoritos" value={favoritesCount} href="/favoritos" />
              </div>

              {/* Barra de acciones (CTA) */}
              <div className="mt-6">
                <div className="flex flex-wrap gap-2">
                  {!editMode && (
                    <Button size="sm" onClick={() => setEditMode(true)} className="rounded">
                      Editar perfil
                    </Button>
                  )}
                  <Button size="sm" className="rounded" variant="outline" onClick={signOut}>
                    Cerrar sesión
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="h-4 md:h-6" />

      {/* ===== CONTENIDO ===== */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 pt-8 md:pt-12 pb-10 md:pb-14">
        {!editMode ? (
          <div className="grid grid-cols-1 gap-6 rounded lg:grid-cols-3">
            {/* Principal */}
            <section className="lg:col-span-2 rounded space-y-6">
              <Card className="/10 bg-white/[0.03] rounded-xl border /10">
                <CardHeader>
                  <CardTitle>Información personal</CardTitle>
                  <CardDescription>Estos datos no se comparten públicamente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <KeyRow k="Nombre" v={record.nombre} />
                  <KeyRow k="Teléfono" v={record.phone_number} />
                  <KeyRow k="RUT" v={record.rut} />
                  <KeyRow k="Dirección" v={record.direccion} />
                  <KeyRow k="Sexo" v={record.sexo || "—"} />
                  <KeyRow k="Fecha de nacimiento" v={fechaNacimientoFormateada} />
                </CardContent>
              </Card>
            </section>

            {/* Aside */}
            <aside className="space-y-6">
              <Card className="bg-white/[0.03] rounded-xl border /10">
                <CardHeader>
                  <CardTitle>Preferencias</CardTitle>
                  <CardDescription>Usadas para recomendaciones y el feed.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 bg-black text-sm">
                  <KeyRow k="Región base" v={record.city_region || "—"} />
                  <KeyRow k="Ciudad base" v={record.city_base || "—"} />
                  <KeyRow k="Radio de búsqueda" v={(record.search_radius_km ?? 20) + " km"} />
                  <KeyRow k="Géneros favoritos" v={(record.fav_main_genres?.join(", ") || "—")} />
                </CardContent>
              </Card>

              <Card className="bg-white/[0.03] rounded-xl border /10">
                <CardHeader>
                  <CardTitle>Seguridad</CardTitle>
                  <CardDescription>Protege tu cuenta</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => toast("Pronto: cambiar contraseña")}>Cambiar contraseña</Button>
                    <Button size="sm" variant="outline" onClick={() => toast("Pronto: activar 2FA")}>Activar 2FA</Button>
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        ) : (
          <FormProvider {...methods}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setConfirmOpen(true);
              }}
              className="space-y-6"
              noValidate
            >
              <Card className="/10 bg-white/[0.03] border /10">
                <CardHeader>
                  <CardTitle>Editar perfil</CardTitle>
                  <CardDescription>Actualiza tu información.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <RHFInput name="nombre" label="Nombre *" />
                  <RHFInput name="phone_number" label="Teléfono" />
                  <RHFInput name="rut" label="RUT" />
                  <RHFInput name="direccion" label="Dirección" />
                  <RHFSelectShadcn
                    name="sexo"
                    label="Sexo"
                    options={[
                      { value: "Femenino", label: "Femenino" },
                      { value: "Masculino", label: "Masculino" },
                      { value: "No binario", label: "No binario" },
                      { value: "Prefiero no decirlo", label: "Prefiero no decirlo" },
                      { value: "Otro", label: "Otro" },
                    ]}
                  />
                  <RHFInput name="fecha_nacimiento" label="Fecha de nacimiento" type="date" />
                </CardContent>
              </Card>

              <Card className="/10 bg-white/[0.03] border /10">
                <CardHeader>
                  <CardTitle>Avatar</CardTitle>
                  <CardDescription>Sube una imagen cuadrada para mejor resultado.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm text-muted-foreground">Vista previa actual</p>
                    <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-[#FE8B02]/60 shadow-[0_8px_30px_rgba(254,139,2,0.35)]">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-2xl">
                          {displayName[0]?.toUpperCase() ?? "U"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <RHFFile name="photo_url" label="Reemplazar avatar (opcional)" />
                  </div>
                </CardContent>
              </Card>

              <Card className="/10 bg-white/[0.03] border /10">
                <CardHeader>
                  <CardTitle>Preferencias</CardTitle>
                  <CardDescription>Personaliza tu experiencia.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Región */}
                  <RHFSelectShadcn
                    name="city_region"
                    label="Región"
                    placeholder="Selecciona región"
                    options={REGIONES_CHILE}
                  />
                  {/* Ciudad dependiente de región */}
                  <RegionCitySelect />

                  <RHFInput
                    name="search_radius_km"
                    label="Radio de búsqueda (km)"
                    type="number"
                    min={1}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">Mínimo 1 km.</p>
                  <div className="col-span-full">
                    <RHFMultiSelect
                      name="fav_main_genres"
                      label="Géneros principales favoritos"
                      options={MAIN_GENRES.map((g) => ({ value: g, label: g }))}
                      placeholder="Mantén Cmd/Ctrl para seleccionar múltiples"
                      size={6}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  Guardar cambios
                </Button>
              </div>
            </form>
          </FormProvider>
        )}
      </div>

      {/* Modal de confirmación */}
      {confirmOpen && (
        <ModalConfirm
          title="¿Guardar los cambios?"
          description="Se actualizarán los datos de tu perfil."
          loading={saving}
          onConfirm={onConfirmSave}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </main>
  );
}

/* ======= Helpers UI ======= */
function KeyRow({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 py-2 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v ?? "—"}</span>
    </div>
  );
}

// Componente dependiente para ciudad según región seleccionada
function RegionCitySelect() {
  const { control, setValue } = useFormContext<ProfileForm>();
  const region = useWatch({ control, name: "city_region" }) as string | undefined;
  const options = (region && CIUDADES_POR_REGION[region]) ? CIUDADES_POR_REGION[region] : [];
  // if region changes and current city no longer valid, clear it
  const currentCity = useWatch({ control, name: "city_base" }) as string | undefined;
  React.useEffect(() => {
    if (currentCity && (!region || !CIUDADES_POR_REGION[region]?.includes(currentCity))) {
      setValue("city_base", "");
    }
  }, [region]);
  return (
    <Controller
      name="city_base"
      control={control}
      render={({ field }) => (
        <div className="space-y-1">
          <label className="block text-sm font-medium text-foreground">Ciudad</label>
          <Select onValueChange={field.onChange} value={field.value ?? ""}>
            <SelectTrigger className="w-full bg-white/5 border border-white/15">
              <SelectValue placeholder={region ? "Selecciona ciudad" : "Primero selecciona región"} />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[100] bg-neutral-900 border border-white/10 text-foreground">
              {options.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}