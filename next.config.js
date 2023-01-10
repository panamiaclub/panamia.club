/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    trailingSlash: true,
  
    webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    //   config.module.rules.push({
    //     test: "/invoice/[id]",
    //     loader: "raw-loader",
    //   });
  
      // Important: return the modified config
      return config
    },
  }
  
  module.exports = nextConfig
  