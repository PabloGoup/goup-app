import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const FormattedContent = ({ text }: { text: string }) => {
  return (
    <div className="space-y-4 text-sm /90 leading-relaxed">
      {text.split("\n\n").map((paragraph, i) => (
        <p key={i} className="whitespace-pre-line">
          {paragraph.split("\n").map((line, j) => (
            <span key={j}>
              <strong>
                {line.match(/^\d+\.\s/) || line.startsWith("•")
                  ? line.split(" ")[0] + " "
                  : ""}
              </strong>
              {line.match(/^\d+\.\s/) || line.startsWith("•")
                ? line.substring(line.indexOf(" ") + 1)
                : line}
              <br />
            </span>
          ))}
        </p>
      ))}
    </div>
  );
};

export default function Footer() {
  const [modalContent, setModalContent] = useState<string | null>(null);
  const contents: Record<string, string> = {
    "¿Qué es GoUp?":
      "GoUp es una plataforma digital creada para revolucionar la forma en que las personas interactúan con la vida nocturna y los eventos. No es solo una app: es un ecosistema completo que conecta a usuarios, clubes, productores y DJs, facilitando experiencias memorables de manera ágil, segura y personalizada.\n\n" +
      "Desde un inicio, GoUp nace con un propósito claro: eliminar las barreras que existen al momento de salir de fiesta. ¿Cuántas veces te has aburrido esperando en una fila? ¿O has llegado a un evento sin saber si cumplías el dress code, si había disponibilidad, o si valía la pena? GoUp responde a eso.",

    "Nuestra Promesa":
      "• Para los asistentes: Acceso rápido, sin filas, sin confusión. Puedes explorar eventos, comprar entradas, conocer los requisitos de ingreso (edad mínima, dress code, zonas VIP, horarios, lineup y más) y llevar tu entrada en el celular, con validación rápida y segura.\n" +
      "• Para los clubes: Herramientas inteligentes para gestionar eventos, controlar aforo, visualizar ventas en tiempo real y segmentar al público según sus políticas internas.\n" +
      "• Para los productores: Posibilidad de publicar y monetizar eventos fácilmente, colaborar con DJs, conectar con clubes y potenciar la venta de entradas a través de links promocionales personalizados.\n" +
      "• Para los DJs: Perfiles profesionales con links a su música, followers, estilo, biografía, agenda de eventos y posibilidad de ser contratados directamente.",

    "Preguntas frecuentes":
      "1. ¿Qué es GoUp y para qué sirve?\n" +
      "GoUp es una aplicación que conecta a usuarios con clubes, productores y DJs. Sirve para encontrar eventos, comprar entradas, acceder rápidamente sin hacer fila, ver el lineup, reservar zonas VIP y mucho más.\n\n" +
      "2. ¿Necesito crear una cuenta para usar GoUp?\n" +
      "Sí. Para acceder a todas las funcionalidades (como comprar entradas o seguir DJs), necesitas crear una cuenta gratuita. Solo tomará unos segundos y puedes hacerlo con tu correo, Google o redes sociales.\n\n" +
      "3. ¿Cómo sé si un evento tiene restricciones de edad o vestimenta?\n" +
      "Cada evento en GoUp muestra claramente los requisitos: edad mínima, dress code, disponibilidad VIP, horarios y políticas de acceso. Esto te permite saber de antemano si cumples con las condiciones.\n\n" +
      "4. ¿Cómo compro una entrada?\n" +
      "Solo debes seleccionar el evento que te interesa, revisar la información y presionar “Comprar entrada”. Puedes pagar con tarjetas, transferencias u otros métodos disponibles. Recibirás un código QR en tu perfil.\n\n" +
      "5. ¿Dónde encuentro mi entrada después de comprarla?\n" +
      "La entrada estará siempre disponible dentro de tu perfil, en la sección “Mis eventos”. Solo necesitas mostrar el código QR en la puerta del evento para acceder.\n\n" +
      "6. ¿Puedo transferir mi entrada a otra persona?\n" +
      "Por seguridad, actualmente no es posible transferir entradas entre cuentas. Esto previene fraudes y asegura que cada entrada esté asociada a un usuario validado.\n\n" +
      "7. ¿Qué pasa si un evento se cancela?\n" +
      "Si el evento se cancela, se activará el proceso de reembolso automático. Te notificaremos por correo o dentro de la app con los pasos a seguir.\n\n" +
      "8. ¿Cómo puedo saber si un evento aún tiene cupos disponibles?\n" +
      "En la ficha del evento verás si hay entradas disponibles. Algunos eventos incluso muestran un contador visual del aforo o de las entradas que quedan.\n\n" +
      "9. ¿GoUp funciona en todo Chile?\n" +
      "Actualmente GoUp está activo en las principales ciudades de Chile y seguimos expandiéndonos. Puedes buscar eventos filtrando por ciudad o región.\n\n" +
      "10. ¿Qué hago si tengo un problema con la app o mi cuenta?\n" +
      "Puedes escribirnos directamente al correo contacto@goup.cl o desde el botón de soporte dentro de la app. Responderemos lo antes posible.",

    "¿Eres productor?":
      "Con GoUp puedes crear tu perfil de productor, gestionar tu productora y publicar tus eventos.",

    "Crea tu evento":
      "Publica eventos en minutos con flyer, lineup, zonas VIP y más, todo desde tu panel.",

    "Que nos hace únicos":
      "• Segmentación inteligente del público según edad, preferencias, vestimenta o historial.\n" +
      "• Validación rápida con QR y sistema antifraude.\n" +
      "• Estadísticas y analítica avanzada para clubes y productores.\n" +
      "• Integración con redes sociales, seguimiento de DJs y geolocalización de eventos.\n" +
      "• Privacidad cuidada: Los datos sensibles se manejan de forma responsable, cumpliendo con las normativas vigentes.",

    "Términos y condiciones":
      "Al usar GoUp aceptas nuestras políticas de uso, seguridad y protección de datos.",

    "Política de privacidad":
      "Tu información está protegida bajo estándares internacionales de privacidad y cifrado."
  };

  const closeModal = () => setModalContent(null);

  return (
    <>
      <footer className="bg-zinc-900 text-white mt-20 border-t /10 relative z-10">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div>
            <h4 className="text-[#8e2afc] font-bold mb-3">Sobre GoUp</h4>
            <ul className="space-y-2 /80">
              {["¿Qué es GoUp?", "Nuestra Promesa", "Preguntas frecuentes"].map(item => (
                <li key={item}>
                  <button onClick={() => setModalContent(item)} className="hover:underline text-white text-left">
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-[#8e2afc] font-bold mb-3">Tu Evento</h4>
            <ul className="space-y-2 /80">
              {["¿Eres productor?", "Crea tu evento", "Que nos hace únicos"].map(item => (
                <li key={item}>
                  <button onClick={() => setModalContent(item)} className="hover:underline text-white text-left">
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-[#8e2afc] font-bold mb-3">Legal</h4>
            <ul className="space-y-2 /80">
              {["Términos y condiciones", "Política de privacidad"].map(item => (
                <li key={item}>
                  <button onClick={() => setModalContent(item)} className="hover:underline  text-white text-left">
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-[#8e2afc] font-bold mb-3">Contacto</h4>
            <ul className="space-y-2 /80">
              <li><span>contacto@goup.cl</span></li>
              <li><span>+56 9 9435 4820</span></li>
              <li><span>Lun a Vie: 10:00 a 18:00 hrs</span></li>
            </ul>
          </div>
        </div>
        <div className="border-t /10 text-center /50 text-xs py-4">
          © {new Date().getFullYear()} GoUp. Todos los derechos reservados.
        </div>
      </footer>

      <AnimatePresence>
        {modalContent && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 z-40"
              onClick={closeModal}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 bg-zinc-900 text-white p-6 z-50 rounded-t-2xl shadow-2xl border-t border-[#8e2afc] max-h-[70vh] overflow-y-auto"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", bounce: 0.2 }}
            >
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold text-white text-[#8e2afc]">{modalContent}</h2>
                <button onClick={closeModal} className="/70 hover:">✕</button>
              </div>
              <FormattedContent text={contents[modalContent]} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}