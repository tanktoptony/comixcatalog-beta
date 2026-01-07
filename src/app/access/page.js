"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ACCESS_CODE = process.env.NEXT_PUBLIC_BETA_ACCESS_CODE;

export default function AccessPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleSubmit(e) {
    e.preventDefault();

    if (code.trim() === ACCESS_CODE) {
      localStorage.setItem("cc_beta_access", "true");
      router.push("/");
    } else {
      setError("Invalid access code.");
    }
  }

  return (
    <main className="access-page">
      <h1>ComixCatalog Beta Access</h1>
      <p>This beta is currently available to Patreon members only.</p>

      <form onSubmit={handleSubmit}>
        <input
          className="input"
          placeholder="Enter access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />

        <button className="btn" type="submit">
          Unlock Access
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </main>
  );
}
