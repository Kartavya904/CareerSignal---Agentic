const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@careersignal/schemas', '@careersignal/db'],
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@careersignal/schemas': path.resolve(__dirname, '../../packages/schemas/src'),
      '@careersignal/db': path.resolve(__dirname, '../../packages/db/src'),
    };
    return config;
  },
};

module.exports = nextConfig;
