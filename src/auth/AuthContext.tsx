import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  auth,
  provider,
  signOut as firebaseSignOut,
  onUserChanged,
} from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User as FirebaseUser } from "firebase/auth";
import type { DBUser } from "@/types/auth";

type AuthContextType = {
  user: FirebaseUser | null;
  dbUser: DBUser | null;
  rol: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DBUser | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Escuchar cambios de auth
  useEffect(() => {
    const unsubscribe = onUserChanged(firebaseUser => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Cuando cambia `user`, cargamos o creamos su perfil en Firestore
  useEffect(() => {
    if (!user) {
      setDbUser(null);
      setRol(null);
      return;
    }

    const fetchOrCreateDbUser = async () => {
      try {
        const ref = doc(db, "usersWeb", user.uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          // Si el documento no existe, lo creamos
          const newUser: DBUser = {
            uid: user.uid,
            email: user.email ?? "",
            nombre: user.displayName ?? "",
            rol: "user", // ✅ rol por defecto permitido
            creado: new Date(),
          };
          await setDoc(ref, newUser);
          setDbUser(newUser);
          setRol(newUser.rol);
        } else {
          const data = snap.data() as DBUser;
          setDbUser(data);
          setRol(data.rol ?? null);
        }
      } catch (e) {
        console.error("Error cargando DBUser:", e);
        setDbUser(null);
        setRol(null);
      }
    };

    fetchOrCreateDbUser();
  }, [user]);

  // Cerrar sesión
  const signOut = async () => {
    await firebaseSignOut();
    setUser(null);
    setDbUser(null);
    setRol(null);
  };

  // Iniciar sesión con Google
  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Error al iniciar sesión con Google:", e);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, dbUser, rol, loading, signOut, signInWithGoogle }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return ctx;
};