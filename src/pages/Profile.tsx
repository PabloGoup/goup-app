// src/pages/Profile.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useFormContext, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import ThemeToggle from "@/components/ThemeToggle";

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

// Inputs
import { RHFInput, RHFFile } from "@/components/form/control";

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
            <SelectTrigger className="w-full">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
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
export default function ProfilePage() {
  const { user, dbUser, loading: authLoading, signOut } = useAuth();

  const [loadingPage, setLoadingPage] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

        const defaults: ProfileForm = {
          nombre: data.nombre ?? "",
          phone_number: data.phone_number ?? "",
          rut: data.rut ?? "",
          direccion: data.direccion ?? "",
          sexo: typeof data.sexo === "string" ? data.sexo : "",
          fecha_nacimiento: data.fecha_nacimiento?.seconds
            ? new Date(data.fecha_nacimiento.seconds * 1000)
                .toISOString()
                .split("T")[0]
            : data.fecha_nacimiento ?? "",
          photo_url: null,
        };
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
              <div className="absolute inset-0 bg-gradient-to-br from-[#241237] via-[#371a5e] to-[#8e2afc]" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black/80" />
            </>
          )}
        </div>

        {/* Contenido del hero */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 pt-8 md:pt-12 pb-10 md:pb-14">
          <div className="grid gap-8 md:gap-10 md:grid-cols-[300px_1fr] items-end">
            {/* Avatar con aro */}
            <figure className="relative w-[200px] md:w-[260px] aspect-square rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
              <div className="relative w-full aspect-square rounded-2xl ring-4 ring-[#8e2afc]/40 overflow-hidden">
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
                  <div className="flex gap-2">
                    {!editMode && (
                      <Button size="sm" onClick={() => setEditMode(true)}>
                        Editar perfil
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={signOut}>
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Principal */}
            <section className="lg:col-span-2 space-y-6">
              <Card className="/10 bg-white/[0.03] border /10">
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
              <Card className="/10 bg-white/[0.03] border /10">
                <CardHeader>
                  <CardTitle>Cuenta</CardTitle>
                  <CardDescription>Administra tu perfil y sesión.</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  {!editMode && <Button onClick={() => setEditMode(true)}>Editar datos</Button>}
                  <Button variant="outline" onClick={signOut}>
                    Cerrar sesión
                  </Button>
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
    <div className="flex items-center justify-between border-b /10 py-2 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v ?? "—"}</span>
    </div>
  );
}