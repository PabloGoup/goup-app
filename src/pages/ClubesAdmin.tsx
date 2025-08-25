// src/pages/ClubesAdmin.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import AddressMapInputGoogle from "@/components/form/AddressMapInput";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { Link } from "react-router-dom";
import { googleMapsLink, wazeLink } from "@/lib/mapLinks";
import { SiInstagram, SiWhatsapp, SiFacebook, SiX } from "react-icons/si";
import { FiShare2 } from "react-icons/fi";
import { LuGlobe } from "react-icons/lu";
import { MdOutlineMail } from "react-icons/md";

import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

import { useAuth } from "@/auth/AuthContext";
import toast from "react-hot-toast";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { RHFInput, RHFTextarea, RHFSelect, RHFFile } from "@/components/form/control";

/* ---------------- Types & helpers ---------------- */
type DBClubes = {
  id: string;
  uid_usersWeb: string;
  nombre: string;
  descripcion: string | null;
  direccion: string | null;
  ciudad: string | null;
  pais: string | null;
  latitud: number | null;
  longitud: number | null;
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

/* ---------------- Form schema ---------------- */
const editSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional().or(z.literal("")),
  direccion: z.string().optional().or(z.literal("")),
  ciudad: z.string().optional().or(z.literal("")),
  pais: z.string().optional().or(z.literal("")),
  latitud: z.coerce.number().optional().nullable(),
  longitud: z.coerce.number().optional().nullable(),
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

/* ---------------- UI helpers ---------------- */
const BTN_PRIMARY =
  "inline-flex items-center justify-center rounded-md bg-[#8e2afc] hover:bg-[#7b1fe0] px-4 py-2 text-sm font-semibold disabled:opacity-60 transition";
const BTN_SECONDARY =
  "inline-flex items-center justify-center px-4 py-2 rounded border /20 hover:bg-white/10 text-sm font-semibold";

/** Colores de marca para tintar los íconos */
const BRAND = {
  instagram: "#FFFFFF",
  whatsapp: "#FFFFFF",
  facebook: "#FFFFFF",
  x: "#FFFFFF",
  web: "#FFFFFF",
  email: "#FFFFFF",
} as const;
type BrandKey = keyof typeof BRAND;

/** Normalizadores de links */
const instagramUrl = (v?: string | null) =>
  v ? (v.startsWith("http") ? v : `https://instagram.com/${v.replace("@", "")}`) : undefined;

const whatsappUrl = (phone?: string | null) =>
  phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : undefined;

/** Botón redondo genérico para redes/acciones */
function SocialIconBtn({
  href,
  onClick,
  label,
  brand,
  disabled,
  children,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  brand?: BrandKey;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    `inline-flex w-9 h-9 items-center justify-center rounded-full border border-white/15 ` +
    (disabled ? "bg-white/20 text-white/60 cursor-not-allowed" : "bg-black/60 hover:bg-black/75");
  const style = brand ? { color: BRAND[brand] } : undefined;

  return href ? (
    <a
      href={disabled ? undefined : href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className={cls}
      style={style}
      onClick={(e) => {
        if (disabled) e.preventDefault();
      }}
    >
      <span className="inline-flex w-4 h-4">{children}</span>
    </a>
  ) : (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cls}
      style={style}
      disabled={disabled}
    >
      <span className="inline-flex w-4 h-4">{children}</span>
    </button>
  );
}

/* ---------------- Main component ---------------- */
export default function ClubAdmin() {
  const { user, dbUser } = useAuth();
  const [club, setClub] = useState<DBClubes | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const originalValuesRef = useRef<EditForm | null>(null);

  // Carga del script de Google Maps
  const { isLoaded } = useJsApiLoader({
    id: "goup-maps",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
    libraries: ["places"],
  });

  const methods = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: undefined,
    mode: "onChange",
  });

  const firestore = getFirestore();
  const storage = getStorage();

  /* -------- Fetch club -------- */
  useEffect(() => {
    const fetchClub = async () => {
      const selectedClubId = localStorage.getItem("adminSelectedClubId");
      if (!selectedClubId) {
        console.warn("No se encontró ID en localStorage");
        setLoading(false);
        return;
      }
      try {
        const docRef = doc(firestore, "club", selectedClubId);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.error("Club no encontrado.");
          setLoading(false);
          return;
        }
        const data = docSnap.data() as DBClubes;
        setClub(data);
        setDocId(docSnap.id);

        const defaults: EditForm = {
          nombre: data.nombre,
          descripcion: data.descripcion ?? "",
          direccion: data.direccion ?? "",
          ciudad: data.ciudad ?? "",
          pais: data.pais ?? "",
          latitud: data.latitud ?? null,
          longitud: data.longitud ?? null,
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
      } catch (error) {
        console.error("Error al cargar club:", error);
        toast.error("Error al cargar el club.");
      } finally {
        setLoading(false);
      }
    };
    fetchClub();
  }, [firestore, methods]);

  /* Enlaces sociales derivados */
  const instaHref = instagramUrl(club?.instagram ?? undefined);
  const waHref = whatsappUrl(club?.telefono ?? undefined);
  const webHref = club?.sitio_web || undefined;
  const mailHref = club?.email ? `mailto:${club.email}` : undefined;

  /* -------- Upload helper -------- */
  const uploadImage = async (file: File | null, folder: "imagen" | "banner") => {
    if (!file || !user) return null;
    const path = `${folder}/${user.uid}/${Date.now()}_${file.name}`;
    const ref = storageRef(storage, path);
    const snap = await uploadBytes(ref, file);
    return getDownloadURL(snap.ref);
  };

  /* -------- Cancel / Save -------- */
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
        latitud: typeof values.latitud === "number" ? values.latitud : null,
        longitud: typeof values.longitud === "number" ? values.longitud : null,
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
        latitud: merged.latitud ?? null,
        longitud: merged.longitud ?? null,
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

  /* ---------------- Links externos (no condicionar hooks) ---------------- */
  const gmapsHref = useMemo(() => {
    if (!club) return "#";
    const lat = typeof club.latitud === "number" ? club.latitud : undefined;
    const lng = typeof club.longitud === "number" ? club.longitud : undefined;
    const addr = club.direccion?.trim() || [club.ciudad, club.pais].filter(Boolean).join(", ") || undefined;
    return googleMapsLink(lat, lng, addr);
  }, [club?.latitud, club?.longitud, club?.direccion, club?.ciudad, club?.pais]);

  const wazeHref = useMemo(() => {
    if (!club) return "#";
    const lat = typeof club.latitud === "number" ? club.latitud : undefined;
    const lng = typeof club.longitud === "number" ? club.longitud : undefined;
    const addr = club.direccion?.trim() || [club.ciudad, club.pais].filter(Boolean).join(", ") || undefined;
    if (typeof lat === "number" && typeof lng === "number") return wazeLink(lat, lng);
    if (addr) return `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`;
    return "#";
  }, [club?.latitud, club?.longitud, club?.direccion, club?.ciudad, club?.pais]);

  const gDisabled = gmapsHref === "#";
  const wDisabled = wazeHref === "#";

  /* ---------------- Favoritos & Compartir ---------------- */
  const [isFav, setIsFav] = useState<boolean>(() => {
    const key = docId ? `fav:club:${docId}` : null;
    return key ? localStorage.getItem(key) === "1" : false;
  });
  useEffect(() => {
    if (!docId) return;
    localStorage.setItem(`fav:club:${docId}`, isFav ? "1" : "0");
  }, [isFav, docId]);

  const [shareOpen, setShareOpen] = useState(false);
  const onShare = () => {
    const url = location.href;
    const text = `Mira ${club?.nombre ?? "este club"} en GoUp`;
    if (navigator.share) {
      navigator.share({ title: club?.nombre ?? "GoUp Club", text, url }).catch(() => {});
    } else {
      setShareOpen((v) => !v);
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast.success("Enlace copiado");
      setShareOpen(false);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  /* Botón redondo reutilizable (para favorito y otros SVGs sueltos) */
  const IconBtn: React.FC<{
    title: string;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    children: React.ReactNode;
  }> = ({ title, href, onClick, disabled, children }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className={`inline-flex w-9 h-9 items-center justify-center rounded-full border border-white/15 ${
          disabled ? "bg-white/20 text-white/60 cursor-not-allowed" : "bg-black/60 hover:bg-black/75"
        }`}
        onClick={(e) => {
          if (disabled) e.preventDefault();
        }}
      >
        <span className="inline-flex w-4 h-4">{children}</span>
      </a>
    ) : (
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={`inline-flex w-9 h-9 items-center justify-center rounded-full border border-white/15 ${
          disabled ? "bg-white/20 text-white/60" : "bg-black/60 hover:bg-black/75"
        }`}
      >
        <span className="inline-flex w-4 h-4">{children}</span>
      </button>
    );

  /* ---------------- Render ---------------- */
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

  const backHref = "/clubes";

  return (
    <div className="">
      {/* ===== HERO con desvanecido ===== */}
      <section className="relative isolate w-full overflow-visible -mb-16 md:-mb-20">
        {/* Fondo difuminado con máscara */}
        <div
          className="pointer-events-none absolute -inset-x-40 -top-28 -bottom-20 -z-10 overflow-visible"
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
            maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
          }}
        >
          {club.banner ? (
            <>
              <img
                src={club.banner}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover scale-[1.35] blur-[72px] opacity-[0.55]"
              />
              <div className="absolute inset-0 [background:radial-gradient(1200px_560px_at_64%_32%,rgba(0,0,0,0)_0%,rgba(0,0,0,.55)_60%,rgba(0,0,0,.98)_100%)]" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black/80" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#201022] via-[#2b1638] to-black" />
          )}
        </div>

        {/* Contenido */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 pt-8 md:pt-12 pb-10 md:pb-14">
          <div className="grid gap-8 md:gap-10 md:grid-cols-[340px_1fr] items-start">
            {/* Avatar cuadrado */}
            <div className="shrink-0">
              <figure className="relative w-[250px] sm:w-[300px] md:w-[340px] aspect-square rounded-2xl overflow-hidden border border-white/10 bg-white/5">
                {club.imagen ? (
                  <img
                    src={club.imagen}
                    alt={club.nombre}
                    className="w-full h-full object-cover"
                    loading="eager"
                    decoding="sync"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-white/10">
                    <span className="text-5xl font-black">{club.nombre?.[0]?.toUpperCase() ?? "C"}</span>
                  </div>
                )}

                {/* Favorito overlay */}
                <div className="absolute right-2 bottom-2">
                  <IconBtn
                    title={isFav ? "Quitar de favoritos" : "Añadir a favoritos"}
                    onClick={() =>
                      setIsFav((v) => {
                        const next = !v;
                        toast.success(next ? "Agregado a favoritos" : "Quitado de favoritos");
                        return next;
                      })
                    }
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41.99 4.22 2.48C11.53 4.99 13.2 4 14.94 4 17.44 4 19.5 6 19.5 8.5c0 3.78-3.4 6.86-8.05 11.54L12 21.35z" />
                    </svg>
                  </IconBtn>
                </div>
              </figure>

              {/* Redes / Acciones */}
              <div className="mt-3 flex items-center gap-2 relative">
                {instaHref && (
                  <SocialIconBtn href={instaHref} label="Instagram" brand="instagram">
                    <SiInstagram className="w-4 h-4" />
                  </SocialIconBtn>
                )}

                {waHref && (
                  <SocialIconBtn href={waHref} label="WhatsApp" brand="whatsapp">
                    <SiWhatsapp className="w-4 h-4" />
                  </SocialIconBtn>
                )}

                {webHref && (
                  <SocialIconBtn href={webHref} label="Sitio web" brand="web">
                    <LuGlobe className="w-4 h-4" />
                  </SocialIconBtn>
                )}

                {mailHref && (
                  <SocialIconBtn href={mailHref} label="Correo" brand="email">
                    <MdOutlineMail className="w-4 h-4" />
                  </SocialIconBtn>
                )}

                <SocialIconBtn label="Compartir" onClick={onShare}>
                  <FiShare2 className="w-4 h-4" />
                </SocialIconBtn>

                {/* Popover fallback para compartir */}
                {shareOpen && (
                  <div className="absolute top-11 left-0 z-40 rounded-xl border border-white/10 bg-black/80 backdrop-blur px-3 py-2 text-sm shadow-lg">
                    <div className="grid gap-1 min-w-[240px]">
                      <a
                        className="hover:bg-white/10 rounded px-2 py-1 inline-flex items-center gap-2"
                        href={`https://wa.me/?text=${encodeURIComponent(`Mira ${club.nombre} en GoUp: ${location.href}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShareOpen(false)}
                      >
                        <SiWhatsapp className="w-4 h-4" /> WhatsApp
                      </a>
                      <a
                        className="hover:bg-white/10 rounded px-2 py-1 inline-flex items-center gap-2"
                        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(`Mira ${club.nombre} en GoUp`)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShareOpen(false)}
                      >
                        <SiX className="w-4 h-4" /> X (Twitter)
                      </a>
                      <a
                        className="hover:bg-white/10 rounded px-2 py-1 inline-flex items-center gap-2"
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShareOpen(false)}
                      >
                        <SiFacebook className="w-4 h-4" /> Facebook
                      </a>
                      <button
                        className="text-left hover:bg-white/10 rounded px-2 py-1 inline-flex items-center gap-2"
                        onClick={copyLink}
                      >
                        <MdOutlineMail className="w-4 h-4" /> Copiar enlace
                      </button>
                      <div className="text-white/60 px-2 pt-1 text-xs">
                        * Instagram/Stories no permiten compartir directo desde web; usa “Copiar enlace”.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* META + ubicación + CTAs */}
            <div className="min-w-0">
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">{club.nombre}</h1>

              <div className="mt-3 text-white/85 space-y-1">
                <div className="text-lg font-medium">{[club.ciudad, club.pais].filter(Boolean).join(" · ") || "—"}</div>
                {club.direccion && <div className="text-sm text-white/70">{club.direccion}</div>}
              </div>

              {/* Chips */}
              <div className="flex flex-wrap gap-2 mt-4">
                {club.accesibilidad && <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Accesibilidad</span>}
                {club.estacionamientos && <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Estacionamientos</span>}
                {club.guardaropia && <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Guardarropía</span>}
                {club.terraza && <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Terraza</span>}
                {club.fumadores && <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Zona fumadores</span>}
                {club.wifi && <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Wi-Fi</span>}
              </div>

              {/* Barra ubicación + CTAs */}
              <div className="mt-6">
                <div className="rounded-xl border border-white/15 bg-black/40 backdrop-blur px-4 py-3">
                  <p className="text-sm text-white/70 leading-none">Ubicación</p>
                  <p className="text-base font-semibold truncate">
                    {club.direccion
                      ? `${club.direccion}${club.ciudad ? `, ${club.ciudad}` : ""}${club.pais ? `, ${club.pais}` : ""}`
                      : "No configurada"}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <a
                      href={gmapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (gDisabled) {
                          e.preventDefault();
                          toast.error("No hay dirección/ubicación del club.");
                        }
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-semibold shadow text-center ${
                        gDisabled ? "bg-white/20 text-white/60 cursor-not-allowed" : "bg-white/10 hover:bg-white/15"
                      }`}
                    >
                      Google Maps
                    </a>
                    <a
                      href={wazeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (wDisabled) {
                          e.preventDefault();
                          toast.error("No hay dirección/ubicación del club.");
                        }
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-semibold shadow text-center ${
                        wDisabled ? "bg-white/20 text-white/60 cursor-not-allowed" : "bg-white/10 hover:bg-white/15"
                      }`}
                    >
                      Waze
                    </a>
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="mt-4 flex gap-2">
                <Link to={backHref} className={BTN_SECONDARY}>
                  ← Volver
                </Link>
                {dbUser?.rol === "admin" && (
                  <button onClick={() => setEditMode(true)} className={BTN_PRIMARY}>
                    Editar club
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Separador para transición suave */}
  
      {/* ===== Content ===== */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 pt-8 md:pt-12 pb-10 md:pb-14">
        {!editMode ? (
          <>
            {/* Grid principal */}
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
               

                {club.descripcion && (
                  <section className="p-5 bg-white/[0.03] rounded-xl border /10">
                    <h2 className="text-lg font-bold text-[#cbb3ff] mb-2">Descripción</h2>
                    <p className="/80 leading-relaxed">{club.descripcion}</p>
                  </section>
                )}

                <section className="p-5 bg-white/[0.03] rounded-xl border /10">
                  <h2 className="text-lg font-bold text-[#cbb3ff] mb-3">Servicios</h2>
                  <div className="flex flex-wrap gap-2">
                    {club.accesibilidad && (
                      <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Accesibilidad</span>
                    )}
                    {club.estacionamientos && (
                      <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Estacionamientos</span>
                    )}
                    {club.guardaropia && (
                      <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Guardarropía</span>
                    )}
                    {club.terraza && (
                      <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Terraza</span>
                    )}
                    {club.fumadores && (
                      <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Zona fumadores</span>
                    )}
                    {club.wifi && <span className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15">Wi-Fi</span>}
                  </div>
                </section>
              </div>

              {/* Aside */}
              <aside className="space-y-6">
  {club.latitud && club.longitud && (
    <section className="p-5 bg-white/[0.03] rounded-xl border border-white/10">
      <h3 className="text-sm font-semibold text-[#cbb3ff] mb-2">Mapa</h3>

      {/* sangrado hasta los bordes del card */}
      <div className="-mx-5 -mb-5 mt-3 rounded-b-xl overflow-hidden">
        <div className="h-64 md:h-72">
          {!isLoaded ? (
            <div className="h-full w-full bg-white/5 animate-pulse" />
          ) : (
            <GoogleMap
              mapContainerClassName="w-full h-full"
              zoom={16}
              center={{ lat: club.latitud!, lng: club.longitud! }}
              options={{
                disableDefaultUI: true,
                clickableIcons: false,
                gestureHandling: "greedy",
              }}
            >
              <MarkerF position={{ lat: club.latitud!, lng: club.longitud! }} />
            </GoogleMap>
          )}
        </div>
      </div>
    </section>
  )}

                <section className="p-5 bg-white/[0.03] rounded-xl border /10">
                  <h3 className="text-sm font-semibold text-[#cbb3ff] mb-2">Contacto</h3>
                  <div className="space-y-2 text-sm /80">
                    {club.telefono && <div className="rounded-md bg-white/5 border /10 px-3 py-2"><p className="/60 text-xs">Teléfono</p><p className=" break-words">{club.telefono}</p></div>}
                    {club.email && <div className="rounded-md bg-white/5 border /10 px-3 py-2"><p className="/60 text-xs">Email</p><p className=" break-words">{club.email}</p></div>}
                    {club.sitio_web && <div className="rounded-md bg-white/5 border /10 px-3 py-2"><p className="/60 text-xs">Web</p><p className=" break-words">{club.sitio_web}</p></div>}
                    {club.instagram && <div className="rounded-md bg-white/5 border /10 px-3 py-2"><p className="/60 text-xs">Instagram</p><p className=" break-words">{club.instagram}</p></div>}
                  </div>
                </section>
              </aside>
            </div>
          </>
        ) : (
          /* -------- Edit Mode Form -------- */
          <FormProvider {...methods}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                askSave();
              }}
              className="space-y-6"
              noValidate
            >
              <section className="space-y-4">
                <h2 className="text-xl font-bold text-[#8e2afc]">Identidad & contacto</h2>
                <RHFInput name="nombre" label="Nombre del club *" />
                <RHFTextarea name="descripcion" label="Descripción" rows={3} />

                <AddressMapInputGoogle
                  nameDireccion="direccion"
                  nameLat="latitud"
                  nameLng="longitud"
                  label="Dirección * (autocompletar y selecciona en mapa)"
                />

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
              </section>

              <section className="space-y-4">
                <h2 className="text-xl font-bold text-[#8e2afc]">Servicios & capacidades</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <RHFSelect name="accesibilidad" label="Accesibilidad" options={["Sí", "No"]} />
                  <RHFSelect name="estacionamientos" label="Estacionamientos" options={["Sí", "No"]} />
                  <RHFSelect name="guardaropia" label="Guardarropía" options={["Sí", "No"]} />
                  <RHFSelect name="terraza" label="Terraza" options={["Sí", "No"]} />
                  <RHFSelect name="fumadores" label="Zona fumadores" options={["Sí", "No"]} />
                  <RHFSelect name="wifi" label="Wi-Fi" options={["Sí", "No"]} />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <RHFInput name="ambientes" type="number" label="Ambientes" />
                  <RHFInput name="banos" type="number" label="Baños" />
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-xl font-bold text-[#8e2afc]">Imágenes</h2>
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
                        <div className="w-full h-full bg-white/10 grid place-items-center text-2xl">Sin banner</div>
                      )}
                    </div>
                    <RHFFile name="bannerFile" label="Reemplazar banner" />
                  </div>
                </div>
              </section>

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