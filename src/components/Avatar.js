import { avatarForProfile } from "@/lib/defaultAvatar";

export default function Avatar({ profile, src, alt = "", width = 48, height = width, ...props }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src || avatarForProfile(profile)} alt={alt} width={width} height={height} {...props} />;
}
