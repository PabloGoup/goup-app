// src/pages/ProducerCreate.tsx
import React, { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { useAuth } from "@/auth/AuthContext";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/goup_logo.png";

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
            className="px-4 py-2 rounded bg-[#8e2afc] hover:bg-[#7b1fe0]"
          >
            Ir a mi productora
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className=" px-4 py-8 ">
      <header className="max-w-3xl mx-auto space-y-2 mb-8 text-center">
        <img src={logo} alt="GoUp" className="mx-auto w-28 " />
        <h1 className="text-3xl md:text-4xl font-extrabold">
          CREAR <span className="text-[#8e2afc]">PRODUCTORA</span>
        </h1>
        <p className="/70">
          Publica tu productora para gestionar tus datos de contacto.
        </p>
      </header>

      <FormProvider {...methods}>
        <form
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
            <h2 className="text-xl font-bold text-[#cbb3ff]">
              Imagen de perfil
            </h2>
            <RHFFile name="imagen" label="Logo / avatar" />
          </section>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2 rounded-md bg-[#8e2afc] hover:bg-[#7b1fe0]"
            >
              Crear productora
            </button>
          </div>
        </form>
      </FormProvider>
    </main>
  );
}