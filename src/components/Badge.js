import { markSvg } from "@/lib/badges/marks";

function Shape({ shape, uid }) {
  if (shape === "circle") return <><circle cx="64" cy="64" r="60" fill="#0b1e5b" /><circle cx="64" cy="64" r="54" fill={`url(#${uid}-twill)`} /><circle cx="64" cy="64" r="57" fill="none" stroke="#f6cf2e" strokeWidth="2.5" strokeDasharray="4 3" /></>;
  if (shape === "hex") return <><polygon points="64,4 116,34 116,94 64,124 12,94 12,34" fill="#0b1e5b" /><polygon points="64,11 110,38 110,90 64,117 18,90 18,38" fill={`url(#${uid}-gold)`} /><polygon points="64,7.5 113,36 113,92 64,120.5 15,92 15,36" fill="none" stroke="#0b1e5b" strokeWidth="2.5" strokeDasharray="4 3" /></>;
  return <><path d="M64 4 116 20v42c0 34-26 54-52 62-26-8-52-28-52-62V20Z" fill="#0b1e5b" /><path d="M64 11 110 25v37c0 30-23 48-46 55-23-7-46-25-46-55V25Z" fill={`url(#${uid}-twill)`} /><path d="M64 7.5 113 22.5V62c0 32-25 51-49 58.5C40 113 15 94 15 62V22.5Z" fill="none" stroke="#f6cf2e" strokeWidth="2.5" strokeDasharray="4 3" /></>;
}

function Mark({ badge, foundingNumber }) {
  // Static SVG markup from the shared mark artwork (src/lib/badges/marks.js).
  return <g dangerouslySetInnerHTML={{ __html: markSvg(badge, { foundingNumber, fontFamily: "var(--font-display), Impact, sans-serif" }) }} />;
}

export default function Badge({ badge, earned = true, progress, foundingNumber, size = 128, showText = true, showName = false }) {
  const percent = progress?.target ? Math.min(100, Math.round((progress.progress / progress.target) * 100)) : 0;
  const uid = `badge-${badge.id}`;
  return (
    <div className={`collector-badge${earned ? "" : " is-locked"}`} style={{ "--badge-size": `${size}px` }}>
      <div className="collector-badge-patch">
        <svg viewBox="0 0 128 128" role="img" aria-label={`${badge.name}${earned ? "" : ", locked"}`}>
          <defs>
            <pattern id={`${uid}-twill`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" fill="#123c9c" /><rect width="3" height="6" fill="#1a49b4" /></pattern>
            <pattern id={`${uid}-gold`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" fill="#f2c425" /><rect width="3" height="6" fill="#f7d54e" /></pattern>
          </defs>
          <Shape shape={badge.shape} uid={uid} />
          <Mark badge={badge} foundingNumber={foundingNumber ?? badge.foundingNumber} />
        </svg>
      </div>
      {showName && !showText && <span className="collector-badge-name">{badge.name}</span>}
      {showText && <><strong>{badge.name}</strong><small>{earned ? badge.description : `${progress?.progress ?? 0} of ${progress?.target ?? badge.threshold ?? 1}`}</small>{!earned && <span className="badge-progress"><i style={{ width: `${percent}%` }} /></span>}</>}
    </div>
  );
}
