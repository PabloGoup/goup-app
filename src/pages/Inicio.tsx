import HeroVideo from "./HeroVideo";
import Beneficios from "@/components/home/Beneficios";
import MicroFeatures from "@/components/home/MicroFeatures";
import PartnersStrip from "@/components/home/PartnersStrip";
import Testimonios from "@/components/home/Testimonios";
import CarouselClubes from "@/components/CarouselClubes";
import HeroLastEvent from "@/components/HeroLastEvent";

export default function Inicio() {
  return (
    <main className="text-white">
  
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