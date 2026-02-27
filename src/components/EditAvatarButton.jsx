"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabase/client";

const AVATAR_KEYS = [
  "cc_badge",
  "hero_01",
  "hero_02",
  "hero_03",
  "hero_04",
  "hero_05",
  "hero_06",
  "hero_07",
  "hero_08",
  "hero_09",
  "hero_10",
  "hero_11",
  "hero_12",
  "hero_13",
  "hero_14",
  "hero_15",
  "hero_16",
];

export default function EditAvatarButton({ profileId, currentAvatar }) {
  const supabase = getSupabaseClient();

  const [isOwner, setIsOwner] = useState(false);
  const [editing, setEditing] = useState(false);
  const [avatarKey, setAvatarKey] = useState(currentAvatar || "cc_badge");

  useEffect(() => {
    async function checkOwner() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && user.id === profileId) {
        setIsOwner(true);
      }
    }

    checkOwner();
  }, [profileId]);

  async function handleAvatarChange(newKey) {
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_key: newKey })
      .eq("id", profileId);

    if (!error) {
      setAvatarKey(newKey);
      setEditing(false);
      window.location.reload(); // simple Phase 1 refresh
    }
  }

  if (!isOwner) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <button
        className="profile-share-btn"
        onClick={() => setEditing(!editing)}
      >
        {editing ? "Cancel" : "Edit Avatar"}
      </button>

      {editing && (
        <div className="avatar-edit-panel">
          {AVATAR_KEYS.map((key) => (
            <button
              key={key}
              className={`avatar-choice ${
                key === avatarKey ? "is-selected" : ""
              }`}
              onClick={() => handleAvatarChange(key)}
            >
              <Image
                src={`/avatars/${key}.png`}
                alt={key}
                width={60}
                height={60}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}