// lib/firebase/events.ts
import { db } from "@/lib/firebase"; // asegúrate que esta ruta es correcta a tu archivo Firebase
import { collection, getDocs, query, orderBy } from "firebase/firestore";

// Tipado opcional si lo tienes
export interface Event {
  id: string;
  nombre: string;
  fecha: string;
  flyer: string;
  generos: string[];
  tipo: string;
  // ... otros campos si deseas
}

export async function getAllEvents(): Promise<Event[]> {
  try {
    const eventsRef = collection(db, "evento");
    const q = query(eventsRef, orderBy("fecha", "desc"));
    const snapshot = await getDocs(q);

    const events = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Event[];

    return events;
  } catch (error) {
    console.error("Error al obtener eventos:", error);
    return [];
  }
}