// src/pages/mi-club.tsx
import UserClub from "@/components/UserClub";

export default function MiClubPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 ">Mi club</h1>
      <UserClub />
    </div>
  );
}