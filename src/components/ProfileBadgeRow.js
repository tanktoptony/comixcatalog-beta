import Link from "next/link";
import Badge from "@/components/Badge";

export default function ProfileBadgeRow({ username, badges = [], foundingNumber }) {
  if (!badges.length) return null;
  return (
    <div className="profile-achievements">
      <div className="profile-achievements-row">
        {badges.map((badge) => <Badge key={badge.id} badge={badge} foundingNumber={foundingNumber} size={58} showText={false} showName />)}
      </div>
      <Link href={`/u/${encodeURIComponent(username)}/badges`}>All badges</Link>
    </div>
  );
}
