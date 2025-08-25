// src/layouts/AppLayout.tsx (o donde lo tengas)
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";

export default function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col bg-background text-foreground">
      <Header />

      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          className="pt-16 flex-1"
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
      <BottomNav />
      
      <Footer />
    </div>
  );
}