"use client";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <Image
          src="/img/logos/cc_badge.png" // ⬅ adjust path if needed
          alt="ComixCatalog badge"
          width={44}
          height={44}
          className="footer-badge"
        />
        <p className="footer-tag">
          Built in Chicago by collectors, for collectors.
        </p>
        <p className="tiny">ComixCatalog™ · {new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}
