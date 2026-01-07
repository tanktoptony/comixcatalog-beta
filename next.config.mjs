/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.comics.org",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
