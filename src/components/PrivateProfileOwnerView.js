"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import { canSeePrivateMembers } from "@/lib/admin";
import { getPrivateProfileView } from "@/lib/profileAccess";
import AdminMfaGate from "./AdminMfaGate";
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

// Loads a private profile with the viewer's session. mode "owner" is the
// member's own page; "private-member" is Tony's accounts viewing anyone's.
// Distinct URLs so these requests never share an edge-cache entry with the
// anonymous (cacheable) response for the same profile.
function useProfile(username, mode) {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    const controller = new AbortController();
    authedFetch(`/api/public-profile?username=${encodeURIComponent(username)}&view=${mode}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        setState(res.ok && body ? { status: "ok", data: body } : { status: "failed", data: null });
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        console.error("private profile fetch failed:", error);
        setState({ status: "failed", data: null });
      });
    return () => controller.abort();
  }, [username, mode]);
  return state;
}

function OwnerProfile({ username }) {
  const { status, data } = useProfile(username, "owner");
  if (status === "loading") return <main className="profile-page" aria-busy="true" />;
  if (!data) return <PrivateMessage />;
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

function PrivateMemberProfile({ username }) {
  const { status, data } = useProfile(username, "private-member");
  if (status === "loading") return <main className="profile-page" aria-busy="true" />;
  if (!data) return <PrivateMessage />;
  return (
    <>
      <div className="profile-page" style={{ paddingBottom: 0 }}>
        <div className="profile-side-card" role="status">
          <span>Private profile. Members can&apos;t see this page; you can because you run the site.</span>
        </div>
      </div>
      <ProfileView data={data} />
    </>
  );
}

// A private profile renders here (the server can't see who is viewing).
// The owner sees their own page. Tony's accounts (admin + @test_tony) see
// any private member's page in full, right here at /u/<username> (Tony,
// 2026-11-24); the admin account enters its two-factor code inline first,
// once per sign-in, as on /admin. Everyone else gets the private message.
export default function PrivateProfileOwnerView({ username }) {
  const { user, profile, loading, profileLoading } = useAuth();
  if (loading || profileLoading) return <main className="profile-page" aria-busy="true" />;

  const view = getPrivateProfileView({
    exists: true,
    isPublic: false,
    viewerUsername: profile?.username,
    routeUsername: username,
  });
  if (view === "owner") return <OwnerProfile username={username} />;
  if (canSeePrivateMembers(user?.id)) {
    return (
      <AdminMfaGate>
        <PrivateMemberProfile username={username} />
      </AdminMfaGate>
    );
  }
  return <PrivateMessage />;
}
