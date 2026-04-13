//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  nx: {},
  async rewrites() {
    const apiUrl = process.env.API_URL || 'http://localhost:4000'
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
      {
        source: '/audio/:path*',
        destination: `${apiUrl}/audio/:path*`,
      },
    ]
  },
}

const plugins = [withNx];

module.exports = composePlugins(...plugins)(nextConfig);
