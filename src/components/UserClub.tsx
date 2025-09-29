// src/pages/UserClubes.tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { useAuth } from "@/auth/AuthContext";
import toast from "react-hot-toast";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  RHFInput,
  RHFTextarea,
  RHFSelect,
  RHFFile,
} from "@/components/form/control";

// — Types & Helpers
type DBClubes = {
  uid_usersWeb: string;
  nombre: string;
  descripcion: string | null;
  direccion: string | null;
  ciudad: string | null;
  pais: string | null;
  telefono: string | null;
  email: string | null;
  sitio_web: string | null;
  instagram: string | null;
  imagen: string | null;
  banner: string | null;
  accesibilidad: boolean;
  estacionamientos: boolean;
  guardaropia: boolean;
  terraza: boolean;
  fumadores: boolean;
  wifi: boolean;
  ambientes: number | null;
  banos: number | null;
};

const asSiNo = (b?: boolean | null) => (b ? "Sí" : "No");
const asBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase();
  return s === "sí" || s === "si" || s === "true" || s === "1";
};
const asIntOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// — Form schema
const editSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional().or(z.literal("")),
  direccion: z.string().optional().or(z.literal("")),
  ciudad: z.string().optional().or(z.literal("")),
  pais: z.string().optional().or(z.literal("")),
  telefono: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  sitio_web: z.string().optional().or(z.literal("")),
  instagram: z.string().optional().or(z.literal("")),
  accesibilidad: z.union([z.boolean(), z.string()]).default("No"),
  estacionamientos: z.union([z.boolean(), z.string()]).default("No"),
  guardaropia: z.union([z.boolean(), z.string()]).default("No"),
  terraza: z.union([z.boolean(), z.string()]).default("No"),
  fumadores: z.union([z.boolean(), z.string()]).default("No"),
  wifi: z.union([z.boolean(), z.string()]).default("No"),
  ambientes: z.union([z.coerce.number(), z.string()]).optional().or(z.literal("")),
  banos: z.union([z.coerce.number(), z.string()]).optional().or(z.literal("")),
  imagenFile: z.any().optional().nullable(),
  bannerFile: z.any().optional().nullable(),
});
type EditForm = z.infer<typeof editSchema>;

// — Button styles
const BTN_PRIMARY =
  "inline-flex items-center justify-center rounded-md bg-[#FE8B02] hover:bg-[#7b1fe0] px-4 py-2 text-sm font-semibold disabled:opacity-60 transition";
const BTN_SECONDARY =
  "inline-flex items-center justify-center px-4 py-2 rounded border /20 hover:bg-white/10 text-sm font-semibold";

// — UI helpers
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-[#FE8B02]">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/5 border /10 px-3 py-2">
      <p className="/60 text-xs">{label}</p>
      <p className=" break-words">{value}</p>
    </div>
  );
}

// — Main component
export default function UserClubes() {
  const { user } = useAuth();
  const [club, setClub] = useState<DBClubes | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const originalValuesRef = useRef<EditForm | null>(null);

  const methods = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: undefined,
    mode: "onChange",
  });

  const firestore = getFirestore();
  const storage = getStorage();

  // Fetch club
  useEffect(() => {
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);

      const clubsCol = collection(firestore, "club");
      const q = query(clubsCol, where("uid_usersWeb", "==", user.uid));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const data = docSnap.data() as DBClubes;
        setClub(data);
        setDocId(docSnap.id);

        // set form defaults
        const defaults: EditForm = {
          nombre: data.nombre,
          descripcion: data.descripcion ?? "",
          direccion: data.direccion ?? "",
          ciudad: data.ciudad ?? "",
          pais: data.pais ?? "",
          telefono: data.telefono ?? "",
          email: data.email ?? "",
          sitio_web: data.sitio_web ?? "",
          instagram: data.instagram ?? "",
          accesibilidad: asSiNo(data.accesibilidad),
          estacionamientos: asSiNo(data.estacionamientos),
          guardaropia: asSiNo(data.guardaropia),
          terraza: asSiNo(data.terraza),
          fumadores: asSiNo(data.fumadores),
          wifi: asSiNo(data.wifi),
          ambientes: data.ambientes ?? "",
          banos: data.banos ?? "",
          imagenFile: null,
          bannerFile: null,
        };
        methods.reset(defaults);
        originalValuesRef.current = defaults;
      }

      setLoading(false);
    })();
  }, [user]);

  // Upload helper
  const uploadImage = async (file: File | null, folder: "imagen" | "banner") => {
    if (!file || !user) return null;
    const path = `${folder}/${user.uid}/${Date.now()}_${file.name}`;
    const ref = storageRef(storage, path);
    const snap = await uploadBytes(ref, file);
    return getDownloadURL(snap.ref);
  };

  // Cancel / Save
  const handleCancel = () => {
    if (originalValuesRef.current) methods.reset(originalValuesRef.current);
    setEditMode(false);
  };
  const askSave = () => setConfirmOpen(true);

  const onConfirmSave = methods.handleSubmit(async (values) => {
    if (!docId || !user) return;
    setSaving(true);
    try {
      const newImg = await uploadImage(values.imagenFile, "imagen");
      const newBanner = await uploadImage(values.bannerFile, "banner");

      const payload: Partial<DBClubes> = {
        nombre: values.nombre,
        descripcion: values.descripcion || null,
        direccion: values.direccion || null,
        ciudad: values.ciudad || null,
        pais: values.pais || null,
        telefono: values.telefono || null,
        email: values.email || null,
        sitio_web: values.sitio_web || null,
        instagram: values.instagram || null,
        accesibilidad: asBool(values.accesibilidad),
        estacionamientos: asBool(values.estacionamientos),
        guardaropia: asBool(values.guardaropia),
        terraza: asBool(values.terraza),
        fumadores: asBool(values.fumadores),
        wifi: asBool(values.wifi),
        ambientes: asIntOrNull(values.ambientes),
        banos: asIntOrNull(values.banos),
        imagen: newImg ?? club?.imagen ?? null,
        banner: newBanner ?? club?.banner ?? null,
      };

      const clubRef = doc(firestore, "club", docId);
      await updateDoc(clubRef, payload);

      toast.success("Datos guardados");
      setClub((c) => (c ? ({ ...c, ...payload } as DBClubes) : c));

      // reset form defaults
      const merged = { ...(club as DBClubes), ...payload };
      const newDefaults: EditForm = {
        nombre: merged.nombre,
        descripcion: merged.descripcion ?? "",
        direccion: merged.direccion ?? "",
        ciudad: merged.ciudad ?? "",
        pais: merged.pais ?? "",
        telefono: merged.telefono ?? "",
        email: merged.email ?? "",
        sitio_web: merged.sitio_web ?? "",
        instagram: merged.instagram ?? "",
        accesibilidad: asSiNo(merged.accesibilidad),
        estacionamientos: asSiNo(merged.estacionamientos),
        guardaropia: asSiNo(merged.guardaropia),
        terraza: asSiNo(merged.terraza),
        fumadores: asSiNo(merged.fumadores),
        wifi: asSiNo(merged.wifi),
        ambientes: merged.ambientes ?? "",
        banos: merged.banos ?? "",
        imagenFile: null,
        bannerFile: null,
      };
      methods.reset(newDefaults);
      originalValuesRef.current = newDefaults;

      setConfirmOpen(false);
      setEditMode(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  });

  // Render
  if (loading) return <div className="p-6 ">Cargando mi club…</div>;
  if (!club) {
    return (
      <div className="/80 p-6">
        <p>No tienes un club creado todavía.</p>
        <Link to="/club/crear" className={BTN_PRIMARY}>
          Crear club
        </Link>
      </div>
    );
  }

  const backHref = "/mis-eventos";

  return (
    <div className="">
      {/* Hero */}
      <div className="relative w-full h-[280px] md:h-[360px] overflow-hidden">
        {club.banner ? (
          <>
            <img
              src={club.banner}
              alt="Banner"
              className="absolute inset-0 w-full h-full object-cover scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/55 to-black" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#25123e] via-[#381a63] to-[#FE8B02]" />
        )}
        <div className="absolute bottom-4 left-4 flex items-end gap-4 z-20">
          <div className="h-24 w-24 rounded-full overflow-hidden border-4 border-[#FE8B02]">
            {club.imagen ? (
              <img
                src={club.imagen}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full grid place-items-center bg-white/10 text-xl">
                {club.nombre[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="pb-1">
            <h1 className="text-3xl font-extrabold drop-shadow">{club.nombre}</h1>
            <p className="/80">
              {[club.ciudad, club.pais].filter(Boolean).join(", ")}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {!editMode ? (
          <>
            <div className="mb-6 flex justify-between">
              <Link to={backHref} className={BTN_SECONDARY}>
                ← Ir a Mis Eventos
              </Link>
              <button
                onClick={() => setEditMode(true)}
                className={BTN_PRIMARY}
              >
                Editar club
              </button>
            </div>

            {/* Display view */}
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {club.descripcion && (
                  <section className="p-5 bg-white/[0.03] rounded-xl border /10">
                    <h2 className="text-lg font-bold text-[#cbb3ff] mb-2">
                      Descripción
                    </h2>
                    <p className="/80 leading-relaxed">
                      {club.descripcion}
                    </p>
                  </section>
                )}
                <section className="p-5 bg-white/[0.03] rounded-xl border /10">
                  <h2 className="text-lg font-bold text-[#cbb3ff] mb-3">
                    Servicios
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {club.accesibilidad && <span className="chip">Accesibilidad</span>}
                    {club.estacionamientos && <span className="chip">Estacionamientos</span>}
                    {club.guardaropia && <span className="chip">Guardarropía</span>}
                    {club.terraza && <span className="chip">Terraza</span>}
                    {club.fumadores && <span className="chip">Zona fumadores</span>}
                    {club.wifi && <span className="chip">Wi-Fi</span>}
                  </div>
                </section>
              </div>
              <aside className="space-y-6">
                <section className="p-5 bg-white/[0.03] rounded-xl border /10">
                  <h3 className="text-sm font-semibold text-[#cbb3ff] mb-2">
                    Contacto
                  </h3>
                  <div className="space-y-2 text-sm /80">
                    {club.telefono && <Info label="Teléfono" value={club.telefono} />}
                    {club.email && <Info label="Email" value={club.email} />}
                    {club.sitio_web && <Info label="Web" value={club.sitio_web} />}
                    {club.instagram && <Info label="Instagram" value={club.instagram} />}
                  </div>
                </section>
              </aside>
            </div>
          </>
        ) : (
          // — Edit Mode Form —
          <FormProvider {...methods}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                askSave();
              }}
              className="space-y-6"
              noValidate
            >
              <Section title="Identidad & contacto">
                <RHFInput name="nombre" label="Nombre del club *" />
                <RHFTextarea name="descripcion" label="Descripción" rows={3} />
                <RHFInput name="direccion" label="Dirección" />
                <div className="grid md:grid-cols-2 gap-4">
                  <RHFInput name="ciudad" label="Ciudad" />
                  <RHFInput name="pais" label="País" />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <RHFInput name="telefono" label="Teléfono" />
                  <RHFInput name="email" type="email" label="Email" />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <RHFInput name="sitio_web" label="Sitio web" />
                  <RHFInput name="instagram" label="Instagram" />
                </div>
              </Section>

              <Section title="Servicios & capacidades">
                <div className="grid md:grid-cols-2 gap-4">
                  <RHFSelect name="accesibilidad" label="Accesibilidad" options={["Sí","No"]}/>
                  <RHFSelect name="estacionamientos" label="Estacionamientos" options={["Sí","No"]}/>
                  <RHFSelect name="guardaropia" label="Guardarropía" options={["Sí","No"]}/>
                  <RHFSelect name="terraza" label="Terraza" options={["Sí","No"]}/>
                  <RHFSelect name="fumadores" label="Zona fumadores" options={["Sí","No"]}/>
                  <RHFSelect name="wifi" label="Wi-Fi" options={["Sí","No"]}/>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <RHFInput name="ambientes" type="number" label="Ambientes" />
                  <RHFInput name="banos" type="number" label="Baños" />
                </div>
              </Section>

              <Section title="Imágenes">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <div className="/70 mb-2">Avatar actual</div>
                    <div className="rounded border /10 mb-2 h-48 overflow-hidden">
                      {club.imagen ? (
                        <img src={club.imagen} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-white/10 grid place-items-center text-2xl">
                          {club.nombre[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <RHFFile name="imagenFile" label="Reemplazar avatar" />
                  </div>
                  <div>
                    <div className="/70 mb-2">Banner actual</div>
                    <div className="rounded border /10 mb-2 h-48 overflow-hidden">
                      {club.banner ? (
                        <img src={club.banner} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-white/10 grid place-items-center text-2xl">
                          Sin banner
                        </div>
                      )}
                    </div>
                    <RHFFile name="bannerFile" label="Reemplazar banner" />
                  </div>
                </div>
              </Section>

              {/* Sticky toolbar */}
              <div className="sticky bottom-0 left-0 right-0 bg-black/70 backdrop-blur px-4 py-3 flex justify-end gap-3 border-t /10">
                <button type="button" onClick={handleCancel} className={BTN_SECONDARY}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className={BTN_PRIMARY}>
                  Guardar cambios
                </button>
              </div>
            </form>
          </FormProvider>
        )}

        {/* Confirmation modal */}
        {confirmOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
            <div className="panel w-[90vw] max-w-md text-center p-6">
              <h3 className="text-lg font-semibold mb-2">¿Guardar los cambios?</h3>
              <p className="/70 mb-5">Se actualizarán los datos del club.</p>
              <div className="flex justify-center gap-3">
                <button className={BTN_SECONDARY} onClick={() => setConfirmOpen(false)}>
                  No
                </button>
                <button className={BTN_PRIMARY} disabled={saving} onClick={() => onConfirmSave()}>
                  Sí, guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}