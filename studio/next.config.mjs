/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  turbopack: {
    root: '.',
  },
  // lib/data.mjs reads brands.json at runtime — make sure it ships in the
  // serverless bundle when this deploys to Vercel.
  outputFileTracingIncludes: {
    '/api/overview': ['./lib/brands.json'],
    '/api/action': ['./lib/brands.json'],
    '/api/thumbs/preview': ['./lib/fonts/**'],
  },
  async redirects() {
    // #103 — /keys retired; key operations live inline on /channels now.
    const tab = (value) => [{ type: 'query', key: 'tab', value }];
    return [
      { source: '/keys', destination: '/channels', permanent: true },
      // Phase 2 (decision #10): the retired hub pages only stitched existing
      // screens together as tabs, so each tab goes to the screen it embedded.
      // Temporary (307) for a week of owner use, then flip to permanent.
      // First match wins, so the ?tab= rules sit above each bare-hub rule.
      { source: '/content', has: tab('social'), destination: '/social', permanent: false },
      { source: '/content', has: tab('audio'), destination: '/music', permanent: false },
      { source: '/content', destination: '/videos', permanent: false },
      { source: '/operations', has: tab('logs'), destination: '/logs', permanent: false },
      { source: '/operations', has: tab('warnings'), destination: '/warnings', permanent: false },
      { source: '/operations', destination: '/production', permanent: false },
      { source: '/network', has: tab('providers'), destination: '/providers', permanent: false },
      { source: '/network', has: tab('usage'), destination: '/usage', permanent: false },
      { source: '/network', destination: '/channels', permanent: false },
    ];
  },
};

export default nextConfig;
