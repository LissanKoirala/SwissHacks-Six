/** Browser-only globe.gl loader — shared by Investment Map and Rendezvous. */

export type GlobeGlFactory = () => (el: HTMLElement) => unknown;

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    (error instanceof Error && error.name === "ChunkLoadError") ||
    /loading chunk .* failed/i.test(message)
  );
}

/**
 * Dynamic import with one automatic full-page retry (stale Next dev chunks after HMR).
 */
export async function loadGlobeGl(): Promise<GlobeGlFactory> {
  try {
    const mod = await import("globe.gl");
    return mod.default as unknown as GlobeGlFactory;
  } catch (error) {
    if (isChunkLoadError(error) && typeof window !== "undefined") {
      const key = "globe-gl-chunk-reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        return new Promise(() => {});
      }
      sessionStorage.removeItem(key);
    }
    throw error;
  }
}
