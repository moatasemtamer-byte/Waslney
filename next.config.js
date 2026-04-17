/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // This replaces the need for the 'next export' command
  images: {
    unoptimized: true
  }
};

module.exports = nextConfig;