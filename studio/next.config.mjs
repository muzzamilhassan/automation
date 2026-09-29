/** @type {import('next').NextConfig} */
const nextConfig = {
  // lib/data.mjs reads brands.json at runtime — make sure it ships in the
  // serverless bundle when this deploys to Vercel.
  outputFileTracingIncludes: {
    '/api/overview': ['./lib/brands.json'],
    '/api/action': ['./lib/brands.json'],
  },
};

export default nextConfig;
