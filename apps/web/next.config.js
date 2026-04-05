//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {},
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/:path*',
      },
      {
        source: '/audio/:path*',
        destination: 'http://localhost:4000/audio/:path*',
      },
    ]
  },
}

const plugins = [withNx];

module.exports = composePlugins(...plugins)(nextConfig);
