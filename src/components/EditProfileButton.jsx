"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import EditProfileModal from "./EditProfileModal";

export default function EditProfileButton({ profile }) {
  const [open, setOpen] = useState(false);
  // Read the cached user from AuthContext rather than calling
  // supabase.auth.getUser() ourselves. The previous approach added a
  // round-trip that hung when auth was slow, so the button never rendered
  // even for the actual owner.
  const { user } = useAuth();
  const router = useRouter();

  const isOwner = Boolean(user?.id && profile?.id && user.id === profile.id);

  if (!isOwner) return null;

  return (
    <>
      <button
        type="button"
        className="profile-action-btn"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        Edit profile
      </button>
      {open && (
        <EditProfileModal
          profile={profile}
          onClose={() => setOpen(false)}
          onSaved={() => {
            // Refresh the server-rendered profile so the new fields paint.
            router.refresh();
          }}
        />
      )}
    </>
  );
}
