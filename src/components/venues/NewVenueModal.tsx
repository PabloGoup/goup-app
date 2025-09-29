import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import AddressMapInputGoogle  from "../form/AddressMapInputGoogle";
import { RHFInput, RHFFile } from "@/components/form/control";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const schema = z.object({
  nombre: z.string().min(1),
  direccion: z.string().min(1),
  ciudad: z.string().min(1),
  pais: z.string().min(1),
  latitud: z.number().optional().nullable(),
  longitud: z.number().optional().nullable(),
  contacto: z.string().optional().or(z.literal("")),
  foto: z.any().nullable(),
});
type FormValues = z.infer<typeof schema>;

export default function NewVenueModal({
  open,
  onClose,
  onCreated, // (clubId, nombre) => void
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (clubId: string, nombre: string) => void;
}) {
  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: "", direccion: "", ciudad: "", pais: "",
      latitud: null, longitud: null, contacto: "", foto: null,
    },
  });

  if (!open) return null;

  const submit = methods.handleSubmit(async (data) => {
    const storage = getStorage();
    let fotoUrl: string | null = null;
    if (data.foto) {
      const ext = (data.foto as File).name.split(".").pop() || "jpg";
      const path = `venue/${Date.now()}.${ext}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, data.foto as File);
      fotoUrl = await getDownloadURL(ref);
    }

    const col = collection(db, "club");
    const ref = doc(col);
    await setDoc(ref, {
      nombre: data.nombre,
      descripcion: null,
      direccion: data.direccion,
      ciudad: data.ciudad,
      pais: data.pais,
      latitud: data.latitud ?? null,
      longitud: data.longitud ?? null,
      telefono: data.contacto || null,
      email: null,
      sitio_web: null,
      instagram: null,
      imagen: fotoUrl,
      banner: null,
      accesibilidad: false,
      estacionamientos: false,
      guardaropia: false,
      terraza: false,
      fumadores: false,
      wifi: false,
      ambientes: 0,
      banos: 0,
      seguidores: 0,
      seguridad: false,
      createdAt: new Date().toISOString(),
    });

    onCreated?.(ref.id, data.nombre);
    onClose();
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/95">
      <div className="panel w-[92vw] max-w-xl p-6 space-y-4">
        <h3 className="text-lg font-bold">Nueva localidad</h3>
        <FormProvider {...methods}>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
            <RHFInput name="nombre" label="Nombre de la localidad *" />
            {/* Autocompletar sin mapa */}
            <AddressMapInputGoogle label="Dirección *" />
            <div className="grid md:grid-cols-2 gap-4">
              <RHFInput name="ciudad" label="Ciudad *" />
              <RHFInput name="pais" label="País *" />
            </div>
            <RHFInput name="contacto" label="Teléfono o email de contacto" />
            <RHFFile name="foto" label="Fotografía" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-4 py-2 rounded border /20" onClick={onClose}>Cancelar</button>
              <button type="submit" className="px-4 py-2 rounded bg-[#FE8B02]">Guardar</button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}