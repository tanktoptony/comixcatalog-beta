"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import { getPrivateProfileView } from "@/lib/profileAccess";
import EditProfileButton from "./EditProfileButton";
import ProfileView from "./ProfileView";

function PrivateMessage() {
  return (
    <main className="profile-page">
      <section className="profile-hero-panel">
        <div className="profile-hero">
          <div className="profile-info">
            <h1 className="profile-username" style={{ fontFamily: "var(--font-display)" }}>
              This collector&apos;s profile is private.
            </h1>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function PrivateProfileOwnerView({ username }) {
  const { profile, loading, profileLoading } = useAuth();
  const [data, setData] = useState(null);

  const view = getPrivateProfileView({
    exists: true,
    isPublic: false,
    viewerUsername: profile?.username,
    routeUsername: username,
  });

  useEffect(() => {
    if (loading || profileLoading || view !== "owner") return;

    const controller = new AbortController();
    // Distinct URL so the owner's request never shares an edge-cache entry
    // with the anonymous (cacheable) response for the same profile.
    authedFetch(`/api/public-profile?username=${encodeURIComponent(username)}&view=owner`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body) setData(body);
      })
      .catch((error) => {
        if (error.name !== "AbortError") console.error("private profile fetch failed:", error);
      });

    return () => controller.abort();
  }, [loading, profileLoading, username, view]);

  if (loading || profileLoading || view !== "owner" || !data) {
    return <PrivateMessage />;
  }

  return (
    <>
      <div className="profile-page" style={{ paddingBottom: 0 }}>
        <div className="profile-side-card" role="status">
          <span>Your profile is private. Only you can see this page.</span>{" "}
          <EditProfileButton profile={data.profile} />
        </div>
      </div>
      <ProfileView data={data} isOwner />
    </>
  );
}
