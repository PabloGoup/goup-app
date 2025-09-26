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
  onSnapshot,
  orderBy,
  limit,
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
import { useController, useWatch } from "react-hook-form";
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
  // Notificaciones (solo push)
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
 * RHF Helpers: Checkbox & MultiSelect
 * ========================= */
function RHFCheckbox({ name, label }: { name: string; label: string }) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!field.value}
            onChange={(e) => field.onChange(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-transparent"
          />
          <span>{label}</span>
        </label>
      )}
    />
  );
}

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
              {/* Toggle chips (no requiere Ctrl/Cmd) */}
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
                          : "bg-white/5 border-white/15 text-white/80 hover:bg-white/10"
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

              {/* Hidden input to satisfy RHF and forms */}
              <input type="hidden" name={name} value={(Array.isArray(field.value) ? field.value : []).join(',')} readOnly />

              {/* Selected chips preview (removibles) */}
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1">
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-xs text-foreground/80">{label}:</span>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );
}

/* =========================
 * Página
 * ========================= */
type NotificationItem = {
  id: string;
  title: string;
  message: string;
  eventId?: string | null;
  eventName?: string | null;
  eventImage?: string | null;
  createdAt?: number | null;
  read?: boolean;
};

export default function ProfilePage() {
  const { user, dbUser, loading: authLoading, signOut } = useAuth();

  const [loadingPage, setLoadingPage] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const unreadCount = notifications.filter(n => !n.read).length;

  const [record, setRecord] = useState<any>(null);
  const originalRef = useRef<ProfileForm | null>(null);

  const [totalEventos, setTotalEventos] = useState(0);
  const [realizados, setRealizados] = useState(0);

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

  // Centro de notificaciones: suscripción en vivo a userNotifications/{uid}/items
  useEffect(() => {
    if (!user?.uid) return;
    const colRef = collection(firebaseDb as Firestore, "userNotifications", user.uid, "items");
    const q = query(colRef, orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      const list: NotificationItem[] = snap.docs.map((d) => {
        const data: any = d.data();
        return {
          id: d.id,
          title: data.title || data.eventName || "Nueva coincidencia",
          message: data.message || "",
          eventId: data.eventId ?? null,
          eventName: data.eventName ?? null,
          eventImage: data.eventImage ?? null,
          createdAt: typeof data.createdAt === "number" ? data.createdAt : (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : null),
          read: !!data.read,
        };
      });
      setNotifications(list);
    });
    return () => unsub();
  }, [user?.uid]);

  /* = Estadísticas de eventos = */
  useEffect(() => {
    (async () => {
      if (!record?.uid) return;
      try {
        const q = query(
          collection(firebaseDb as Firestore, "Eventos"),
          where("uid_usersWeb", "==", "/usersWeb/" + record.uid)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => d.data());
        setTotalEventos(list.length);

        const now = Date.now();
        const pastCount = list.filter((ev: any) => {
          const t = ev.horaCierre || ev.horaInicio || "00:00";
          return now > new Date(`${ev.fecha}T${t}`).getTime();
        }).length;
        setRealizados(pastCount);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [record]);

  const markAsRead = async (id: string) => {
    if (!user?.uid) return;
    const ref = doc(firebaseDb as Firestore, "userNotifications", user.uid, "items", id);
    try {
      await updateDoc(ref, { read: true });
    } catch (e) {
      console.error(e);
      toast.error("No se pudo marcar como leído");
    }
  };

  const markAllAsRead = async () => {
    if (!user?.uid || notifications.length === 0) return;
    try {
      await Promise.all(
        notifications.filter(n => !n.read).map(n => {
          const ref = doc(firebaseDb as Firestore, "userNotifications", user.uid, "items", n.id);
          return updateDoc(ref, { read: true });
        })
      );
      toast.success("Notificaciones marcadas como leídas");
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron marcar todas");
    }
  };

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
  const futuros = Math.max(0, totalEventos - realizados);
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
      <section className="relative isolate w-full overflow-visible -mb-24 md:-mb-32">
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
              <div className="absolute inset-0 bg-gradient-to-br from-[#241237] via-[#371a5e] to-[#FE8B02]" />
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
                <StatBadge icon={CalendarDays} label="Eventos" value={totalEventos} />
                <StatBadge icon={CheckCircle2} label="Realizados" value={realizados} />
                <StatBadge icon={Clock3} label="Próximos" value={futuros} />
                <StatBadge icon={User2} label="Rol" value={displayRol(dbUser?.rol ?? "")} />
              </div>

              {/* Barra de acciones (CTA) */}
              <div className="mt-6">
                <div className="rounded-xl border border-white/15 bg-black/40 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white/70 leading-none">Acciones</p>
                    <p className="text-base font-semibold truncate">Gestiona tu cuenta</p>
                  </div>
                  <div className="flex rounded-xl gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="relative rounded"
                      onClick={() => setNotifOpen(true)}
                    >
                      Notificaciones
                      {unreadCount > 0 && (
                        <span className="ml-2 inline-flex items-center justify-center text-[10px] font-bold leading-none rounded-full bg-[#FE8B02] text-white px-1.5 py-0.5">
                          {unreadCount}
                        </span>
                      )}
                    </Button>

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
        </div>
      </section>
      <div className="h-24 md:h-32" />

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
                  <CardTitle>Notificaciones</CardTitle>
                  <CardDescription>Elige dónde y qué recibir.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <KeyRow k="Push" v={record.noti_push ? "Activadas" : "Desactivadas"} />
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
                    <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-primary/60 shadow-[0_8px_30px_rgba(142,42,252,0.35)]">
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

              <Card className="/10 bg-white/[0.03] border /10">
                <CardHeader>
                  <CardTitle>Notificaciones</CardTitle>
                  <CardDescription>Elige canales y tipos.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4">
                  <RHFCheckbox name="noti_push" label="Recibir notificaciones PUSH" />
                  <p className="text-xs text-muted-foreground">Las notificaciones se enviarán por cualquier subgénero perteneciente a tus géneros principales seleccionados.</p>
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
      {/* Centro de notificaciones (modal) */}
      {notifOpen && (
        <div className="fixed inset-0 z-[90]">
          <div className="absolute inset-0 bg-black/70" onClick={() => setNotifOpen(false)} />
          <div
            className="absolute inset-x-4 md:inset-x-auto md:right-8 top-20 md:top-24 z-[91] w-auto md:w-[560px] rounded-xl border border-white/15 bg-neutral-900 shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div>
                <h3 className="font-semibold">Centro de notificaciones</h3>
                <p className="text-xs text-white/70">
                  Coincidencias de eventos con tus géneros y dentro de tu radio de búsqueda.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={markAllAsRead} disabled={unreadCount === 0}>
                  Marcar todas como leídas
                </Button>
                <Button size="sm" onClick={() => setNotifOpen(false)}>Cerrar</Button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {notifications.length === 0 ? (
                <div className="p-6 text-sm text-white/70">
                  Aún no tienes notificaciones. Cuando haya eventos que coincidan con tus preferencias aparecerán aquí.
                </div>
              ) : (
                <ul className="divide-y divide-white/10">
                  {notifications.map((n) => (
                    <li key={n.id} className={`p-3 flex gap-3 ${!n.read ? "bg-white/[0.03]" : ""}`}>
                      <figure className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-white/5">
                        {n.eventImage ? (
                          <img src={n.eventImage} alt={n.eventName || ""} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-[10px] text-white/60">Evento</div>
                        )}
                      </figure>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{n.title}</p>
                            <p className="text-sm text-white/80 truncate">{n.message}</p>
                          </div>
                          {!n.read && (
                            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-[#FE8B02]/20 text-[#cbb3ff] border border-[#FE8B02]/40">
                              Nuevo
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-white/60">
                          <span>
                            {n.createdAt ? new Date(n.createdAt).toLocaleString("es-CL") : "—"}
                          </span>
                          <div className="flex gap-2">
                            {n.eventId && (
                              <a
                                href={`/evento/${n.eventId}`}
                                className="text-[#cbb3ff] hover:underline"
                              >
                                Ver evento
                              </a>
                            )}
                            {!n.read && (
                              <button
                                className="text-[#cbb3ff] hover:underline"
                                onClick={() => markAsRead(n.id)}
                              >
                                Marcar leído
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
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
    <div className="flex items-center justify-between border-b /10 py-2 text-sm">
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