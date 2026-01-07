"use client";

export default function ComicPanel({ children, className = "" }) {
  return (
    <section
      className={[
        "w-full max-w-[1120px] mx-auto my-10 p-12 rounded-2xl",
        "bg-[linear-gradient(155deg,rgba(11,30,107,0.85)_0%,rgba(0,14,37,0.92)_55%,rgba(0,6,18,0.98)_100%)]",
        "border border-white/10 shadow-[0_8px_20px_rgba(0,0,0,0.55),inset_0_0_20px_rgba(255,215,0,0.05)]",
        "backdrop-blur-sm text-[#f9fafb] transition-all",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}
