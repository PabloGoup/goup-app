// src/pages/LoginPage.tsx

import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { roleHome } from "@/auth/roleHome";
import { FcGoogle } from "react-icons/fc";
import HeroVideo from "./HeroVideo";
import Beneficios from "@/components/home/Beneficios";
import MicroFeatures from "@/components/home/MicroFeatures";
import PartnersStrip from "@/components/home/PartnersStrip";
import Testimonios from "@/components/home/Testimonios";
// Carga el logo de forma que Vite lo incluya correctamente en el build
const logoUrl = new URL("../assets/goup_logo.png", import.meta.url).href;

export default function LoginPage() {
  const { signInWithGoogle, loading, user, dbUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (user) {
      const destination = dbUser
        ? roleHome[dbUser.rol] ?? "/"
        : location.state?.from?.pathname ?? "/";
      navigate(destination, { replace: true });
    }
  }, [loading, user, dbUser, navigate, location]);

  if (loading) return null;

  return (
    
    <main className="">
      <header className="max-w-md mx-auto flex flex-col items-center space-y-6 text-center">
      <h1 className="text-3xl font-extrabold">
          </h1>
          <h1 className="text-3xl font-extrabold">
          </h1>
          <h1 className="text-3xl font-extrabold">
          </h1>
        <div>
          <h1 className="text-3xl font-extrabold">
            CONÉCTATE <span className="text-[#8e2afc]">Y</span> REGÍSTRATE
          </h1>
          <p className="/70">CON NOSOTROS</p>
        </div>
        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-2 px-6 py-2 bg-white text-gray-800 rounded-lg shadow-md hover:shadow-lg transition"
        >
          <FcGoogle size={24} />
          <span className="text-sm font-medium">Continuar con Google</span>
        </button>
      </header>


       <HeroVideo />
            <section className="max-w-6xl mx-auto px-4 py-10">
              <Beneficios />
            </section>
      
            <section className="max-w-6xl mx-auto px-4 py-10">
              <MicroFeatures />
            </section>
      
            <section className="max-w-6xl mx-auto px-4 py-10">
              <PartnersStrip />
            </section>
      
            <section className="max-w-6xl mx-auto px-4 py-10">
              <Testimonios />
            </section>
    </main>
  );
}