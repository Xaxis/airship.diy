/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Fully static. There is no server, no API route, and no runtime: the site is
  // a folder of files. That is the correct shape for an engineering notebook,
  // and it means the deployed artifact cannot do anything the source does not
  // show.
  output: 'export',

  // `next dev` and `next build` share an output directory by default, so a dev
  // server left running while CI builds rewrites the build's manifests
  // underneath it. The failures that produces are baffling.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',

  // The physics packages live outside this workspace, because the model is the
  // product and this site is one renderer of it.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,

  // A pinned build id. Next generates a random one by default, which lands in
  // the output and makes two builds of the same commit differ. A reproducible
  // site is how you check that a deployed page matches the source it claims to
  // come from.
  generateBuildId: () => 'airship',

  images: { unoptimized: true },

  // The site resolves the physics packages through their published `exports`,
  // which point at dist. That means `make build` has to run before `make
  // web-build`, and the Makefile enforces the order.
  //
  // The alternative, aliasing straight into src, does not work: the packages are
  // nodenext ESM and their relative imports carry `.js` extensions that a
  // bundler resolver will not map back onto `.ts`. Building first is also more
  // honest, because the site then renders exactly the artifact the tests ran
  // against.
}

export default nextConfig
