/** @type {import('next').NextConfig} */

// Same-origin API proxy for tunnel/edge deploys: the browser hits the Next
// origin only, and these paths are forwarded server-side to the FastAPI backend.
// Defaults to the local backend, so dev is unaffected.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/clients", destination: `${BACKEND_ORIGIN}/clients` },
      { source: "/clients/:path*", destination: `${BACKEND_ORIGIN}/clients/:path*` },
      { source: "/overview", destination: `${BACKEND_ORIGIN}/overview` },
      { source: "/news", destination: `${BACKEND_ORIGIN}/news` },
      { source: "/breaking", destination: `${BACKEND_ORIGIN}/breaking` },
      { source: "/breaking/poll", destination: `${BACKEND_ORIGIN}/breaking/poll` },
      { source: "/health", destination: `${BACKEND_ORIGIN}/health` },
      { source: "/auth/:path*", destination: `${BACKEND_ORIGIN}/auth/:path*` },
      { source: "/me/:path*", destination: `${BACKEND_ORIGIN}/me/:path*` },
      { source: "/briefing/:path*", destination: `${BACKEND_ORIGIN}/briefing/:path*` },
      { source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` },
    ];
  },
};

export default nextConfig;
