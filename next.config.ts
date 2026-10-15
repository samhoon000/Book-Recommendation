import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The local embedding model runs in Node with native ONNX bindings; never bundle it.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  // On Vercel the ONNX runtime (~290 MB of binaries for every platform) would push each function past the
  // 250 MB limit, so it stays out of the bundle; the embedder's guarded import then falls back to metadata-only
  // scoring (see EMBEDDINGS.enabled). Other hosts keep the full model.
  ...(process.env.VERCEL
    ? { outputFileTracingExcludes: { "*": ["./node_modules/onnxruntime-node/**", "./node_modules/@huggingface/transformers/**"] } }
    : {}),
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
