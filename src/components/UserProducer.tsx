// src/components/UserProducer.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FormProvider, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { useAuth } from "@/auth/AuthContext";
import { RHFInput, RHFFile } from "@/components/form/control";
import { db as firebaseDb } from "@/lib/firebase";

type DBProductor = {
  uid: string;
  nombre: string | null;
  telefono: string | null;
  correo: string | null;
  imagen: string | null;
};

const editSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  telefono: z.string().optional().or(z.literal("")),
  correo: z.string().email("Correo inválido"),
  imagen: z.any().optional().nullable(),
});
type EditForm = z.infer<typeof editSchema>;

export default function UserProducer() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [producer, setProducer] = useState<DBProductor | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const originalRef = useRef<EditForm | null>(null);

  const methods = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: undefined,
    mode: "onChange",
  });

  // Carga inicial
  useEffect(() => {
    (async () => {
      if (!user?.uid) return;
      setLoading(true);

      const q = query(
        collection(firebaseDb, "productora"),
        where("uid", "==", user.uid)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const first = snap.docs[0];
        setDocId(first.id);
        const data = first.data() as DBProductor;
        setProducer(data);

        const defaults: EditForm = {
          nombre: data.nombre ?? "",
          telefono: data.telefono ?? "",
          correo: data.correo ?? user.email ?? "",
          imagen: null,
        };
        methods.reset(defaults);
        originalRef.current = defaults;
      } else {
        setProducer(null);
        setDocId(null);
      }

      setLoading(false);
    })();
  }, [user, methods]);

  // Si aún no existe, mostramos botón de crear
  if (loading) return <div className="">Cargando mi productora…</div>;
  if (!producer) {
    return (
      <div className="/80 bg-neutral-900/60 border /10 rounded-xl p-6">
        <p className="mb-4">Aún no has creado tu productora.</p>
        <Link
          to="/productora/crear"
          className="inline-flex items-center justify-center rounded-md bg-[#8e2afc] hover:bg-[#7b1fe0] px-4 py-2 text-sm font-semibold"
        >
          Crear productora
        </Link>
      </div>
    );
  }

  // Subir imagen
  const uploadImage = async (file: File | null): Promise<string | null> => {
    if (!file || !user) return null;
    const storage = getStorage();
    const path = `productora/${user.uid}/${Date.now()}_${file.name}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    return getDownloadURL(ref);
  };

  const handleCancel = () => {
    if (originalRef.current) methods.reset(originalRef.current);
    setEditMode(false);
  };
  const askSave = () => setConfirmOpen(true);

  const onConfirmSave = methods.handleSubmit(async (values) => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      const newImg = await uploadImage(values.imagen as File | null);
      const payload: DBProductor = {
        uid: user.uid,
        nombre: values.nombre,
        telefono: values.telefono || null,
        correo: values.correo, // garantiza string
        imagen: newImg ?? producer.imagen ?? null,
      };

      if (docId) {
        await updateDoc(doc(firebaseDb, "productora", docId), payload);
      } else {
        // creamos usando UID como ID
        await setDoc(doc(firebaseDb, "productora", user.uid), payload);
        setDocId(user.uid);
      }

      toast.success("Datos guardados");
      setProducer(payload);

      const newDefaults: EditForm = {
        nombre: payload.nombre ?? "",
        telefono: payload.telefono ?? "",
        correo: payload.correo ?? "",     // <-- aquí el coalesce
        imagen: null,
      };
      methods.reset(newDefaults);
      originalRef.current = newDefaults;
      setEditMode(false);
      setConfirmOpen(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  });

  // Vista sólo lectura
  if (!editMode) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="relative bg-neutral-900 rounded-lg overflow-hidden border /10 shadow-md">
          <div className="px-6 pt-4 relative z-20">
            <div className="flex items-end justify-between">
              <div className="flex items-center gap-4">
                <div className="relative -mt-10 z-30 h-20 w-20 rounded-full overflow-hidden border-4 border-[#8e2afc] bg-white/10">
                  {producer.imagen ? (
                    <img
                      src={producer.imagen}
                      alt="logo"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-3xl">
                      {(producer.nombre?.[0] ?? "P").toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="">
                  <h1 className="text-2xl font-extrabold">{producer.nombre}</h1>
                  <p className="/70 text-sm">
                    {producer.correo ?? "—"}{" "}
                    {producer.telefono ? `• ${producer.telefono}` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditMode(true)}
                className="h-10 px-4 rounded-md bg-[#8e2afc] hover:bg-[#7b1fe0]"
              >
                Editar datos
              </button>
            </div>
          </div>
          <div className="p-6  grid grid-cols-1 md:grid-cols-2 gap-4">
            <Info label="Correo" value={producer.correo ?? "—"} />
            <Info label="Teléfono" value={producer.telefono ?? "—"} />
          </div>
        </div>
      </div>
    );
  }

  // Vista edición
  return (
    <div className="max-w-5xl mx-auto">
      <FormProvider {...methods}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            askSave();
          }}
          className="space-y-6"
          noValidate
        >
          <section className="rounded-xl border p-5 bg-white/[0.03] backdrop-blur">
            <h2 className="text-xl font-bold text-[#cbb3ff]">Editar productora</h2>
            <div className="space-y-4">
              <RHFInput name="nombre" label="Nombre *" />
              <RHFInput name="telefono" label="Teléfono" />
              <RHFInput name="correo" label="Correo" />
              <div>
                <p className="/70 text-sm mb-1">Logo actual</p>
                <div className="h-40 w-full mb-2 bg-white/5 flex items-center justify-center border /10">
                  {producer.imagen ? (
                    <img src={producer.imagen} alt="logo" className="h-full" />
                  ) : (
                    <span className="/40">Sin logo</span>
                  )}
                </div>
                <RHFFile name="imagen" label="Reemplazar logo" />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 rounded border /20 hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded bg-[#8e2afc] hover:bg-[#7b1fe0] disabled:opacity-60"
              >
                Guardar
              </button>
            </div>
          </section>
        </form>
      </FormProvider>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
          <div className="bg-neutral-900 rounded-md p-6 max-w-md w-[90vw] text-center border /10">
            <h3 className="text-lg font-semibold mb-2">¿Guardar los cambios?</h3>
            <p className="/70 mb-5">
              Se actualizarán los datos de la productora.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded border /20 hover:bg-white/10"
              >
                No
              </button>
              <button
                onClick={onConfirmSave}
                disabled={saving}
                className="px-4 py-2 rounded bg-[#8e2afc] hover:bg-[#7b1fe0]"
              >
                Sí, guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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