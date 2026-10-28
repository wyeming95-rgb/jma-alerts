import type { NextConfig } from 'next';

// GitHub Pages serves the repo under /jma-alerts; dev stays at / so localhost just works.
const basePath = process.env.NODE_ENV === 'production' ? '/jma-alerts' : '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
