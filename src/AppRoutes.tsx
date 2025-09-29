// src/AppRoutes.tsx
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import CheckIn from "@/pages/CheckIn";
import EventsBrowse from "@/pages/EventsBrowse";
import ClubsBrowse from "@/pages/ClubsBrowse";
import RequireAuth from "./auth/RequireAuth";
import RequireRole from "./auth/RequireRole";
import AppLayout from "./layouts/AppLayout";
import Home from "./pages/Home";
import LoginPage from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";
import ProfilePage from "./pages/Profile";
import ClubCreatePage from "./pages/clubCreate";
import ProductoraPage from "./pages/Producer";
import EventPage from "./pages/Event";
import AdminUsersPage from "./pages/AdminUsers";
import DebugUser from "./pages/DebugUser";
import Dashboard from "./pages/Home";
import MisEventosPage from "./pages/mis-eventos";
import EventDetailPage from "./pages/EventDetail";
import MiClubPage from "./pages/mi-club";
import ProducerCreatePage from "./pages/ProducerCreate";
import RoleRequestPage from "./pages/RoleRequestPage";
import ClubesAdmin from "./pages/ClubAdminDetail";
import ClubAdmin from "./pages/ClubesAdmin";
import ClubVer from "./pages/ClubVer";
import ArtistsBrowse from "./pages/ArtistsBrowse";
import ArtistDetail from "@/pages/ArtistDetail";
import FavoritesPage from "./pages/MisFavoritos";
import Inicio from "./pages/Inicio";
import PaymentReturn from "@/pages/PaymentReturn";
import AdminSales from "@/pages/AdminSales";
import MisTickets from "@/pages/MisTickets";
import CartPage from "./pages/CartPage";
import AnalyticsDashboard from "./pages/analytics/AnalyticsDashboard";

export default function AppRoutes() {
  const location = useLocation();

  return (
    
      <Routes location={location} key={location.pathname}>
        <Route element={<AppLayout />}>
          <Route index element={<Inicio />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="clubes" element={<Home />} />
          <Route path="unauthorized" element={<Unauthorized />} />
          <Route path="/checkin" element={<CheckIn />} />
          {/* Listados públicos */}
          <Route path="/eventos" element={<EventsBrowse />} />
          <Route path="/artistas" element={<ArtistsBrowse />} />
          <Route path="/favoritos" element={<FavoritesPage />} />
          <Route path="/pago/retorno" element={<PaymentReturn />} />
          {/* Detalles públicos:
             - Soportan `/club/<nombre>-<id>` y `/club/<id>`
             - Soportan `/evento/<nombre>-<id>` y `/evento/<id>`
             Asegúrate de extraer el id en los componentes usando el último '-'
          */}
          <Route path="/club/:slugOrId" element={<ClubVer />} />
          <Route path="/evento/:slugOrId" element={<EventDetailPage />} />

          {/* Artistas ya usan slug puro */}
          <Route path="/artistas/:slug" element={<ArtistDetail />} />

   {/* Tickets  */}
          <Route path="/mis-tickets" element={<MisTickets />} />

      {/* Hub unificado de cuenta: analíticas + gestión (versión inicial) */}
      <Route
        path="/cuenta"
        element={
          <RequireAuth>
            <AnalyticsDashboard />
          </RequireAuth>
        }
      />



      <Route
        path="/admin/ventas"
        element={
          <RequireAuth>
            <AdminSales/>
          </RequireAuth>
        }
      />

      <Route
        path="/admin/analytics"
        element={
          <RequireAuth>
            <Navigate to="/cuenta" replace />
          </RequireAuth>
        }
      />
        <Route
        path="/admin/analytics"
        element={
          <RequireAuth>
            <Navigate to="/cuenta" replace />
          </RequireAuth>
        }
      />
          {/* Área autenticada */}
          <Route
            path="perfil"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />

          {/* Esta ruta era tu “ClubVer” protegida sin parámetro.
              La mantengo por compatibilidad si la usas internamente. */}
          <Route
            path="club"
            element={
              <RequireAuth>
                <ClubVer />
              </RequireAuth>
            }
          />

          <Route
            path="dashboard/mi-club"
            element={
              <RequireAuth>
                <RequireRole roles={["admin", "club_owner"]}>
                  <MiClubPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route path="/evento/:slugOrId" element={<EventDetailPage />} />
          <Route path="/carrito" element={<CartPage />} />
          <Route path="/solicitud-estado" element={<RoleRequestPage />} />
          <Route
            path="/solicitud-acceso"
            element={
              <RequireRole roles={["user", "productor", "club_owner", "admin"]}>
                <RoleRequestPage />
              </RequireRole>
            }
          />

          <Route
            path="productora/crear"
            element={
              <RequireAuth>
                <RequireRole roles={["admin", "productor"]}>
                  <ProducerCreatePage />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="club/crear"
            element={
              <RequireAuth>
                <RequireRole roles={["admin", "club_owner"]}>
                  <ClubCreatePage />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="dashboard/productora"
            element={
              <RequireAuth>
                <RequireRole roles={["admin", "productor"]}>
                  <ProductoraPage />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="evento/crear"
            element={
              <RequireAuth>
                <RequireRole roles={["admin", "club_owner", "productor"]}>
                  <EventPage />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/mis-eventos"
            element={
              <RequireAuth>
                <RequireRole roles={["admin", "productor", "club_owner"]}>
                  <MisEventosPage />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/mis-eventos/:id"
            element={
            
                  <EventDetailPage />
       
            }
          />

          <Route
            path="admin"
            element={
              <RequireAuth>
                <RequireRole roles={["admin"]}>
                  <AdminUsersPage />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/miClub"
            element={
            
                  <ClubAdmin />
         
            }
          />

          <Route
            path="/adminClub"
            element={
              <RequireAuth>
                <RequireRole roles={["admin"]}>
                  <ClubesAdmin />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route path="/debug" element={<DebugUser />} />
          <Route path="/inicio" element={<Dashboard />} />
        </Route>
      </Routes>
 
  );
}