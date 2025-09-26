// src/pages/ProducerCreate.tsx
import React, { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { useAuth } from "@/auth/AuthContext";
import { useNavigate } from "react-router-dom";

import { RHFInput, RHFFile } from "@/components/form/control";

import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { db as firebaseDb } from "@/lib/firebase";

const createSchema = z.object({
  nombre: z.string().min(1, "El nombre de la productora es obligatorio"),
  telefono: z.string().optional().or(z.literal("")),
  correo: z.string().email("Correo inválido"),
  imagen: z.any().optional().nullable(),
});
type CreateForm = z.infer<typeof createSchema>;

export default function ProducerCreatePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasProducer, setHasProducer] = useState(false);
  const navigate = useNavigate();

  const methods = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      nombre: "",
      telefono: "",
      correo: user?.email ?? "",
      imagen: null,
    },
    mode: "onChange",
  });

  // Verificar si ya existe en Firestore la productora de este usuario
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const col = collection(firebaseDb as Firestore, "Productoras");
        const q = query(col, where("uid", "==", user.uid));
        const snap = await getDocs(q);
        setHasProducer(!snap.empty);
      } catch (e) {
        console.error("Error comprobando productora:", e);
        toast.error("No se pudo comprobar tu productora");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Helpers para subir imagen a Storage
  const uploadImage = async (file: File | null): Promise<string | null> => {
    if (!file) return null;
    const storage = getStorage();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `productoras/${user!.uid}/${Date.now()}.${ext}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    return getDownloadURL(ref);
  };

  // Submit del formulario
  const onSubmit = methods.handleSubmit(async (values) => {
    if (!user) {
      toast.error("Debes iniciar sesión");
      return;
    }
    setLoading(true);
    try {
      // Re-check existencia
      const col = collection(firebaseDb as Firestore, "Productoras");
      const q = query(col, where("uid", "==", user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        toast.error("Ya tienes una productora creada");
        navigate("/dashboard/productora");
        return;
      }

      // Subir imagen si existe
      const imagenUrl = await uploadImage(values.imagen as File | null);

      // Insertar documento en la colección “Productoras”
      await addDoc(col, {
        uid: user.uid,
        nombre: values.nombre,
        telefono: values.telefono || null,
        correo: values.correo,
        imagen: imagenUrl,
        createdAt: new Date().toISOString(),
      });

      toast.success("¡Productora creada!");
      navigate("/dashboard/productora");
    } catch (err: any) {
      console.error("Error creando productora:", err);
      toast.error(err.message || "No se pudo crear la productora");
    } finally {
      setLoading(false);
    }
  });

  if (loading) {
    return <div className="p-6 ">Cargando…</div>;
  }

  if (hasProducer) {
    return (
      <main className=" px-4 py-8">
        <div className="max-w-xl mx-auto rounded-xl border /10 bg-white/[0.03] p-6 text-center">
          <h2 className="text-xl font-bold mb-2">Ya tienes una productora</h2>
          <p className="/70 mb-4">
            Puedes administrar tus datos desde “Mi productora”.
          </p>
          <button
            onClick={() => navigate("/dashboard/productora")}
            className="px-4 py-2 rounded bg-[#FE8B02] hover:bg-[#7b1fe0]"
          >
            Ir a mi productora
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 pb-12">
      {/* HERO */}
      <section className="relative isolate w-full overflow-visible mb-6 md:mb-10">
        {/* Fondo difuminado con degradado coherente */}
        <div
          className="pointer-events-none absolute -inset-x-40 -top-24 -bottom-20 -z-10"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
            maskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_60%_20%,rgba(142,42,252,.25)_0%,rgba(0,0,0,0)_60%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black/90" />
        </div>

        <div className="max-w-5xl mx-auto px-2 pt-10 md:pt-14 pb-10 text-center">
          <h1 className="text-4xl md:text-8xl font-extrabold tracking-tight">
            Crea tu <span className="bg-gradient-to-r from-[#b388ff] to-[#FE8B02] bg-clip-text text-transparent">productora</span>
          </h1>
          <p className="mt-3 md:mt-4 text-base md:text-lg text-white/80 max-w-3xl mx-auto">
            Impulsa tu marca: conecta con clubes y fans, publica eventos y centraliza tus datos de contacto. Sube tu logo y deja que GoUp haga el resto.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded-md border border-white/20 bg-white/5 hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
            type="submit"
            form="producer-form"
              className="px-4 py-2 rounded-md bg-[#FE8B02] hover:bg-[#7b1fe0]"
                >
                 Crear productora
                </button>
          </div>
        </div>
      </section>

      {/* FORMULARIO */}
      <FormProvider {...methods}>
        <form
          id="producer-form"
          onSubmit={onSubmit}
          className="max-w-3xl mx-auto space-y-6"
          noValidate
        >
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-[#cbb3ff]">Información</h2>
            <RHFInput
              name="nombre"
              label="Nombre de la productora *"
              placeholder="Ej: Purple Nights Productions"
            />
            <RHFInput
              name="telefono"
              label="Teléfono"
              placeholder="+56 9 1234 5678"
            />
            <RHFInput
              name="correo"
              label="Correo *"
              type="email"
              placeholder="productora@ejemplo.com"
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-[#cbb3ff]">Imagen de perfil</h2>
            <RHFFile name="imagen" label="Logo / avatar" />
          </section>

          {/* Acciones al final */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded-md border border-white/20 bg-white/5 hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-md bg-[#FE8B02] hover:bg-[#7b1fe0]"
            >
              Crear productora
            </button>
          </div>
        </form>
      </FormProvider>
    </main>
  );
}