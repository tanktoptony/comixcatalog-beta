import AdminMfaGate from "@/components/AdminMfaGate";

// Admin pages need a two-factor (aal2) session; see AdminMfaGate.
export default function AdminMfaLayout({ children }) {
  return <AdminMfaGate>{children}</AdminMfaGate>;
}
