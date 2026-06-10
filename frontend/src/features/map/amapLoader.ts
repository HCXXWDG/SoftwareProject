const AMAP_SCRIPT_ID = "commute-mood-amap-js";
const AMAP_SCRIPT_BASE_URL = "https://webapi.amap.com/maps";

export interface AMapPointLike {
  getX?: () => number;
  getY?: () => number;
  x?: number;
  y?: number;
}

export interface AMapLngLatLike {
  getLng?: () => number;
  getLat?: () => number;
  lng?: number;
  lat?: number;
}

export interface AMapBoundsLike {
  getSouthWest: () => AMapLngLatLike;
  getNorthEast: () => AMapLngLatLike;
}

export interface AMapInstanceLike {
  destroy: () => void;
  getBounds: () => AMapBoundsLike;
  getZoom: () => number;
  lngLatToContainer: (point: [number, number]) => AMapPointLike;
  off: (eventName: string, listener: () => void) => void;
  on: (eventName: string, listener: () => void) => void;
  resize?: () => void;
}

export interface AMapNamespaceLike {
  Map: new (
    container: HTMLElement,
    options: {
      center: [number, number];
      resizeEnable: boolean;
      viewMode: "2D";
      zoom: number;
    },
  ) => AMapInstanceLike;
}

declare global {
  interface Window {
    AMap?: AMapNamespaceLike;
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
  }
}

interface LoadAMapOptions {
  key: string;
  securityCode?: string;
  timeoutMs?: number;
}

let loaderPromise: Promise<AMapNamespaceLike> | null = null;

export function loadAMap({
  key,
  securityCode,
  timeoutMs = 8_000,
}: LoadAMapOptions): Promise<AMapNamespaceLike> {
  if (window.AMap) {
    return Promise.resolve(window.AMap);
  }

  if (loaderPromise) {
    return loaderPromise;
  }

  if (!key.trim()) {
    return Promise.reject(new Error("AMap browser key is not configured."));
  }

  if (securityCode?.trim()) {
    window._AMapSecurityConfig = {
      ...window._AMapSecurityConfig,
      securityJsCode: securityCode.trim(),
    };
  }

  loaderPromise = new Promise<AMapNamespaceLike>((resolve, reject) => {
    const existingScript = document.getElementById(AMAP_SCRIPT_ID);
    const script = existingScript instanceof HTMLScriptElement
      ? existingScript
      : document.createElement("script");

    let settled = false;
    const finish = (
      result: { namespace: AMapNamespaceLike } | { error: Error },
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);

      if ("namespace" in result) {
        resolve(result.namespace);
        return;
      }

      loaderPromise = null;
      script.remove();
      reject(result.error);
    };

    const handleLoad = () => {
      if (window.AMap) {
        finish({ namespace: window.AMap });
      } else {
        finish({ error: new Error("AMap loaded without exposing window.AMap.") });
      }
    };
    const handleError = () => {
      finish({ error: new Error("Failed to load the AMap JavaScript API.") });
    };
    const timeoutId = window.setTimeout(() => {
      finish({ error: new Error("Timed out while loading the AMap JavaScript API.") });
    }, timeoutMs);

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    if (!existingScript) {
      script.id = AMAP_SCRIPT_ID;
      script.async = true;
      script.src = `${AMAP_SCRIPT_BASE_URL}?v=2.0&key=${encodeURIComponent(key.trim())}`;
      document.head.append(script);
    }
  });

  return loaderPromise;
}

export function resetAMapLoaderForTests(): void {
  loaderPromise = null;
  document.getElementById(AMAP_SCRIPT_ID)?.remove();
  delete window.AMap;
  delete window._AMapSecurityConfig;
}
