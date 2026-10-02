import type { NextConfig } from 'next'

// Pascal's packages ship TypeScript source, so Next transpiles them (same list as Pascal's own app).
const nextConfig: NextConfig = {
  // Next 16 writes AGENTS.md/CLAUDE.md into the app by default; the repo root has ours.
  agentRules: false,
  transpilePackages: ['three', '@pascal-app/core', '@pascal-app/viewer', '@pascal-app/editor', '@pascal-app/nodes', '@pascal-app/mcp'],
  serverExternalPackages: ['node:sqlite'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
}

export default nextConfig
