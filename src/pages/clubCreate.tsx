// src/pages/clubCreate.tsx
import React, { useMemo, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { MUSIC_GENRES } from "@/lib/musicGenres";

// Dirección con Google Places + mapa
import AddressMapInputGoogle from "@/components/form/AddressMapInputGoogle";

import { RHFInput, RHFTextarea, RHFSelect, RHFFile } from "@/components/form/control";

import { collection, doc, query, where, setDoc, Firestore } from "firebase/firestore";
import { getDocs } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db as firebaseDb } from "@/lib/firebase";

/** =====================
 * 1) Esquema y tipos
 * ===================== */
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
  // Preferencias de géneros (opcional) — solo subgéneros
  preferirGeneros: z.boolean().default(false),
  subGenerosPreferidos: z.array(z.string()).default([]),
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
  preferirGeneros: false,
  subGenerosPreferidos: [],
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-[#cbb3ff]">{title}</h2>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="bg-white/[0.03] rounded-xl border /10 p-5 md:p-6 shadow-sm">{children}</div>
    </section>
  );
}

/** =====================
 * 3) Página principal – formulario en UNA sola página
 * ===================== */
export default function ClubCreatePage() {
  const methods = useForm<ClubFormValues>({
    resolver: zodResolver(clubSchema),
    defaultValues: defaultClubValues,
    mode: "onChange",
  });

  // Locks de ciudad / país (controlados por Autocomplete)
  const [locks, setLocks] = useState<{ city: boolean; country: boolean }>({ city: false, country: false });

  // Preferencias musicales
  const preferirGeneros = methods.watch("preferirGeneros");
  const selectedSubs = methods.watch("subGenerosPreferidos");

  // Filtro visual local (no se guarda): género principal -> lista de subgéneros
  const [mainGenre, setMainGenre] = useState<string>("");
  const subsOfMain = useMemo(() => {
    const found = MUSIC_GENRES.find((g) => g.genre === mainGenre);
    return found?.subgenres ?? [];
  }, [mainGenre]);

  const toggleSub = (sg: string) => {
    const current = methods.getValues("subGenerosPreferidos") || [];
    if (current.includes(sg)) {
      methods.setValue(
        "subGenerosPreferidos",
        current.filter((x: string) => x !== sg),
        { shouldDirty: true }
      );
    } else {
      methods.setValue("subGenerosPreferidos", [...current, sg], { shouldDirty: true });
    }
  };

  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  /** Submit */
  const onSubmit = methods.handleSubmit(async (data) => {
    if (saving) return;
    if (!user?.uid) {
      toast.error("Debes iniciar sesión");
      return;
    }
    setSaving(true);

    try {
      // Política: los ADMIN pueden crear tantos clubes como quieran.
      // Para el resto de usuarios, limitamos a 1 club por usuario.
      const clubesCol = collection(firebaseDb as Firestore, "club");
      const usersCol = collection(firebaseDb as Firestore, "usersWeb");

      // Buscamos el rol del usuario actual en su documento de usersWeb
      const userSnap = await getDocs(query(usersCol, where("uid", "==", user.uid)));
      const userRole = userSnap.empty ? null : String((userSnap.docs[0].data() as any).rol || "").toLowerCase();
      const isAdmin = userRole === "admin" || userRole === "administrador" || userRole === "superadmin";

      if (!isAdmin) {
        // Usuario NO admin: permitir sólo un club asociado a su uid
        const snapClub = await getDocs(query(clubesCol, where("uid_usersWeb", "==", user.uid)));
        if (!snapClub.empty) {
          toast.error("Ya tienes un club creado.");
          navigate("/dashboard/mi-club");
          return;
        }
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

      const payload: any = {
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

      // Preferencias de géneros (opcional) — solo subgéneros
      if (data.preferirGeneros && Array.isArray(data.subGenerosPreferidos) && data.subGenerosPreferidos.length > 0) {
        payload.subGenerosPreferidos = data.subGenerosPreferidos;
      } else {
        payload.subGenerosPreferidos = [];
      }

      // Crear con una ref explícita para capturar el id del documento
      const newRef = doc(clubesCol);
      await setDoc(newRef, payload);

      toast.success("¡Club creado con éxito!");
      methods.reset(defaultClubValues);

      // Redirige al detalle del club recién creado.
      // Si tu ruta de detalle usa el id del doc Firestore:
      navigate(`/club/${newRef.id}`);
      // Si en tu app la ruta usa el campo numérico id_club, cambia la línea anterior por:
      // navigate(`/club/${idClub}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al crear el club");
    } finally {
      setSaving(false);
    }
  });

  return (
    <main className="">
      {/* ===== HERO ===== */}
      <section className="relative isolate w-full overflow-hidden">
        {/* Fondo */}
        <div
          className="pointer-events-none absolute -inset-x-40 -top-24 bottom-0 -z-10 overflow-hidden"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
            maskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#201022] via-[#2b1638] to-black" />
          <div className="absolute inset-0 [background:radial-gradient(1200px_560px_at_64%_32%,rgba(0,0,0,0)_0%,rgba(0,0,0,.55)_60%,rgba(0,0,0,.98)_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black/80" />
        </div>

        {/* Contenido héroe */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 pt-10 md:pt-14 pb-16 md:pb-20">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-8xl font-extrabold tracking-tight">
              Crea tu {""}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#b37aff] via-[#9a5cff] to-[#7b2ff7] drop-shadow-[0_2px_8px_rgba(139,92,246,0.35)]">
                club
              </span>
            </h1>
            <p className="mt-3 text-white/85 text-s font-bold max-w-2xl mx-auto">
              Muestra tu espacio, conecta con tu público y empieza a vender entradas. Sube fotos, cuenta tu propuesta y deja que GoUp haga el resto.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-4 py-2 min-w-[160px] rounded-md border border-white/15 bg-white/5 hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="clubForm"
                className="px-4 py-2 min-w-[160px] rounded-md bg-[#FE8B02] hover:bg-[#7b1fe0]"
              >
                Crear club
              </button>
            </div>
          </div>
        </div>
      </section>
      {/* ===== CONTENIDO ===== */}
      <div className="max-w-6xl mx-auto px-4 pb-10">
        <FormProvider {...methods}>
          <form id="clubForm" onSubmit={onSubmit} noValidate className="max-w-3xl mx-auto space-y-8">
            {/* Identidad & contacto */}
            <Section title="Identidad & contacto">
              <RHFInput name="nombre" label="Nombre del club *" />
              <RHFTextarea name="descripcion" label="Descripción *" rows={4} />

              <AddressMapInputGoogle onLock={(l) => setLocks(l)} />

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
            </Section>

            {/* Preferencias de géneros (opcional) */}
            <Section title="Preferencias musicales (opcional)">
              <p className="text-sm /70 mb-2">
                Esto ayudará a que tu club sea más fácil de encontrar en las búsquedas.
              </p>
              <div className="flex items-center gap-3">
                <label className="text-sm">¿Desea agregar géneros musicales de preferencia?</label>
                <select
                  className="goup-select goup-select-sm w-auto"
                  value={preferirGeneros ? "si" : "no"}
                  onChange={(e) => methods.setValue("preferirGeneros", e.target.value === "si")}
                >
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>

              {preferirGeneros && (
                <div className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs /60">
                      Selecciona un género para ver sus subgéneros (solo se guardan subgéneros).
                    </label>
                    <div className="flex gap-2 items-center">
                      <select
                        className="goup-select"
                        value={mainGenre}
                        onChange={(e) => setMainGenre(e.target.value)}
                      >
                        <option value="">Elegir género…</option>
                        {MUSIC_GENRES.map((g) => (
                          <option key={g.slug} value={g.genre}>{g.genre}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs /60">Subgéneros (puedes elegir varios). Solo estos se guardan.</label>
                    {(!mainGenre || subsOfMain.length === 0) ? (
                      <div className="text-sm /60">Primero selecciona un género para ver sus subgéneros.</div>
                    ) : (
                      <div className="flex flex-wrap gap-2 max-w-full">
                        {subsOfMain.map((sg) => {
                          const active = selectedSubs?.includes(sg);
                          return (
                            <button
                              key={sg}
                              type="button"
                              onClick={() => toggleSub(sg)}
                              className={`px-3 py-1 rounded-full border /10 text-sm ${
                                active ? "bg-[#FE8B02]/20 border-[#FE8B02]/40" : "bg-white/5"
                              }`}
                            >
                              {sg}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {Array.isArray(selectedSubs) && selectedSubs.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs /60">Seleccionados ({selectedSubs.length})</span>
                        <button
                          type="button"
                          onClick={() => methods.setValue("subGenerosPreferidos", [], { shouldDirty: true })}
                          className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/15"
                        >
                          Limpiar
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedSubs.map((sg) => (
                          <span
                            key={`picked-${sg}`}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border /10 bg-white/5 text-sm"
                          >
                            {sg}
                            <button
                              type="button"
                              aria-label={`Quitar ${sg}`}
                              onClick={() => toggleSub(sg)}
                              className="ml-1 inline-grid place-items-center w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-xs"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Medios */}
            <Section title="Medios">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="w-full overflow-hidden max-w-full w-full truncate">
                  <RHFFile name="imagen" label="Imagen principal" />
                </div>
                <div className="w-full overflow-hidden">
                  <RHFFile name="banner" label="Banner" />
                </div>
              </div>
            </Section>

            {/* Servicios & capacidades */}
            <Section title="Servicios & capacidades">
              <div className="grid md:grid-cols-2 gap-4">
                <RHFSelect name="accesibilidad" label="Accesibilidad" options={["Sí", "No"]} />
                <RHFSelect name="estacionamientos" label="Estacionamientos" options={["Sí", "No"]} />
                <RHFSelect name="guardaropia" label="Guardarropía" options={["Sí", "No"]} />
                <RHFSelect name="terraza" label="Terraza" options={["Sí", "No"]} />
                <RHFSelect name="fumadores" label="Zona de fumadores" options={["Sí", "No"]} />
                <RHFSelect name="wifi" label="Wi-Fi" options={["Sí", "No"]} />
              </div>
              <div className="grid md:grid-cols-2 gap-4 mt-2">
                <RHFSelect
                  name="ambientes"
                  label="Ambientes"
                  options={Array.from({ length: 11 }, (_, i) => String(i))}
                />
                <RHFSelect
                  name="banos"
                  label="Baños"
                  options={Array.from({ length: 11 }, (_, i) => String(i))}
                />
              </div>
            </Section>

            {/* Submit */}
            <div className="sticky bottom-0 bg-black/10 backdrop-blur border-t /5 py-3">
              <div className="max-w-3xl mx-auto flex gap-2 justify-center">
                <button type="submit" className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold bg-[#FE8B02] hover:bg-[#7b1fe0]">
                  Crear club
                </button>
              </div>
            </div>
          </form>
        </FormProvider>
      </div>
    </main>
  );
}