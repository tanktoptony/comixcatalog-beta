"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import EditProfileModal from "./EditProfileModal";

export default function EditProfileButton({ profile }) {
  const [open, setOpen] = useState(false);
  // Owner check has to happen client-side: the server-rendered page reads
  // auth via the anon key with no cookie, so its isOwner is always false.
  const [isOwner, setIsOwner] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const supabase = getSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled && user?.id === profile?.id) {
        setIsOwner(true);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

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
