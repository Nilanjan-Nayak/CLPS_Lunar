import { ClampToEdgeWrapping, DataTexture, FloatType, LinearFilter, NearestFilter, RedFormat, RepeatWrapping, ShaderMaterial, Texture, Vector2, Vector3, Vector4 } from 'three';
import type { ElevationGrid } from '@/asset-system/AssetMetadata';
import { MOON_RADIUS_KM } from '@/constants/frames';
import type { LatLonBounds } from './MoonGeometry';

let floatLinearSupported: boolean | null = null;
export function supportsFloatLinear(gl: WebGL2RenderingContext | WebGLRenderingContext): boolean {
  if (floatLinearSupported == null) floatLinearSupported = !!gl.getExtension('OES_texture_float_linear');
  return floatLinearSupported;
}

/** Elevation grid (km) → R32F DataTexture sampled in the vertex shader. */
export function demTexture(grid: ElevationGrid, wrapX: boolean, linear: boolean): DataTexture {
  const t = new DataTexture(grid.data as unknown as BufferSource, grid.width, grid.height, RedFormat, FloatType);
  t.wrapS = wrapX ? RepeatWrapping : ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.minFilter = linear ? LinearFilter : NearestFilter;
  t.magFilter = linear ? LinearFilter : NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform sampler2D uDem;
uniform vec2 uDemTexel;
uniform float uRadius;
uniform float uExaggeration;
uniform float uLift;
uniform vec4 uBounds; // west, east, south, north (deg)
uniform vec4 uDemRect; // DEM uv rect covering this patch: (u0, v0, du, dv)
varying vec2 vUv;
varying vec3 vNormalW;
varying float vHeight;
varying vec3 vWorldPos;

#ifdef MANUAL_BILINEAR
// GPUs without OES_texture_float_linear sample the R32F DEM with nearest filtering; interpolate by hand.
float heightAt(vec2 puv) {
  vec2 uv = uDemRect.xy + puv * uDemRect.zw;
  vec2 st = uv / uDemTexel - 0.5;
  vec2 f = fract(st);
  vec2 base = (floor(st) + 0.5) * uDemTexel;
  float h00 = texture2D(uDem, base).r;
  float h10 = texture2D(uDem, base + vec2(uDemTexel.x, 0.0)).r;
  float h01 = texture2D(uDem, base + vec2(0.0, uDemTexel.y)).r;
  float h11 = texture2D(uDem, base + uDemTexel).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}
#else
float heightAt(vec2 puv) { return texture2D(uDem, uDemRect.xy + puv * uDemRect.zw).r; }
#endif
vec3 dirAt(vec2 uv) {
  float lon = radians(mix(uBounds.x, uBounds.y, uv.x));
  float lat = radians(mix(uBounds.w, uBounds.z, uv.y));
  float c = cos(lat);
  return vec3(c * cos(lon), sin(lat), -c * sin(lon));
}
vec3 posAt(vec2 uv) { return dirAt(uv) * (uRadius + heightAt(uv) * uExaggeration + uLift); }

void main() {
  vUv = uv;
  vHeight = heightAt(uv);
  vec3 p = posAt(uv);
  vec2 d = (uDemTexel / uDemRect.zw) * 1.5;
  vec3 tE = posAt(uv + vec2(d.x, 0.0)) - posAt(uv - vec2(d.x, 0.0));
  vec3 tN = posAt(uv - vec2(0.0, d.y)) - posAt(uv + vec2(0.0, d.y));
  vec3 n = normalize(cross(tE, tN));
  vNormalW = normalize(mat3(modelMatrix) * n);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uColor;
uniform vec3 uSunDir;
uniform vec3 uEarthDir;
uniform float uEarthshine;
uniform float uAmbient;
uniform float uFill;
uniform vec3 uTint;
uniform int uOverlay;
uniform float uMinKm;
uniform float uMaxKm;
uniform float uOpacity;
uniform sampler2D uMask;
uniform float uMaskEnabled;
varying vec2 vUv;
varying vec3 vNormalW;
varying float vHeight;
varying vec3 vWorldPos;

vec3 ramp(float t) {
  vec3 a = vec3(0.16, 0.30, 0.85);
  vec3 b = vec3(0.20, 0.75, 0.55);
  vec3 c = vec3(0.95, 0.85, 0.25);
  vec3 d = vec3(0.90, 0.30, 0.20);
  if (t < 0.33) return mix(a, b, t / 0.33);
  if (t < 0.66) return mix(b, c, (t - 0.33) / 0.33);
  return mix(c, d, (t - 0.66) / 0.34);
}

void main() {
  // finer LOD present here → let it replace this surface instead of fighting for depth
  if (uMaskEnabled > 0.5 && texture2D(uMask, vUv).r > 0.5) discard;
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormalW);
  float ndl = max(dot(n, uSunDir), 0.0);
  // soft terminator: a touch of wrap lighting so the night side is not pure black
  float wrap = max(dot(n, uSunDir) * 0.5 + 0.5, 0.0);
  vec3 albedo = texture2D(uColor, vUv).rgb * uTint;
  // gentle view-dependent fill so close-up terrain in low polar light stays readable (visualization aid)
  float fill = max(dot(n, normalize(cameraPosition - vWorldPos)), 0.0) * uFill;
  // earthshine: the Earth lights the near-side night (real, but boosted ×~1000 as a night-reading aid; 0 = off)
  float earthshine = max(dot(n, uEarthDir), 0.0) * uEarthshine * (1.0 - smoothstep(-0.05, 0.1, ndl));
  vec3 col = albedo * (ndl * 1.35 + wrap * 0.06 + uAmbient + fill + earthshine);
  if (uOverlay == 1) {
    float t = clamp((vHeight - uMinKm) / max(uMaxKm - uMinKm, 0.001), 0.0, 1.0);
    col = mix(col, ramp(t) * (ndl * 0.9 + 0.35), 0.6);
  }
  gl_FragColor = vec4(col, uOpacity);
  #include <colorspace_fragment>
}
`;

/**
 * Uniform objects shared by every Moon/terrain material (three.js reads `.value` at draw time), so the night aid and
 * the Earth direction can be driven per frame without re-rendering the tile tree.
 */
export const sharedLightUniforms = {
  uEarthDir: { value: new Vector3(1, 0, 0) },
  uEarthshine: { value: 0 },
};

export interface MoonMaterialOptions {
  dem: DataTexture;
  demSize: { width: number; height: number };
  color: Texture;
  bounds: LatLonBounds;
  radius?: number;
  exaggeration?: number;
  lift?: number;
  sunDir?: Vector3;
  overlay?: boolean;
  minKm?: number;
  maxKm?: number;
  /** true = factor −2; a number sets the factor explicitly (more negative = drawn on top) */
  polygonOffset?: boolean | number;
  /** view-dependent fill light strength (0 = physically dark night side) */
  fill?: number;
  /** set when the GPU cannot filter float textures linearly — enables manual bilinear DEM sampling */
  manualBilinear?: boolean;
  /** albedo multiplier (used to match grayscale LOD2 imagery to the LROC color tone) */
  tint?: Vector3;
  /** sub-rectangle of the DEM texture that covers this patch (u0, v0, du, dv); default = whole texture */
  demRect?: Vector4;
  /** coverage mask of finer LODs over this patch (fragments under set cells are discarded) */
  mask?: Texture | null;
}

export function createMoonMaterial(o: MoonMaterialOptions): ShaderMaterial {
  const m = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uDem: { value: o.dem },
      uDemTexel: { value: new Vector2(1 / o.demSize.width, 1 / o.demSize.height) },
      uRadius: { value: o.radius ?? MOON_RADIUS_KM },
      uExaggeration: { value: o.exaggeration ?? 1 },
      uLift: { value: o.lift ?? 0 },
      uBounds: { value: new Vector4(o.bounds.west, o.bounds.east, o.bounds.south, o.bounds.north) },
      uColor: { value: o.color },
      uSunDir: { value: o.sunDir?.clone() ?? new Vector3(1, 0, 0) },
      uEarthDir: sharedLightUniforms.uEarthDir,
      uEarthshine: sharedLightUniforms.uEarthshine,
      uAmbient: { value: 0.035 },
      uFill: { value: o.fill ?? 0.08 },
      uTint: { value: o.tint?.clone() ?? new Vector3(1, 1, 1) },
      uDemRect: { value: o.demRect?.clone() ?? new Vector4(0, 0, 1, 1) },
      uOverlay: { value: o.overlay ? 1 : 0 },
      uMinKm: { value: o.minKm ?? -9 },
      uMaxKm: { value: o.maxKm ?? 10.8 },
      uOpacity: { value: 1 },
      uMask: { value: o.mask ?? null },
      uMaskEnabled: { value: o.mask ? 1 : 0 },
    },
    defines: o.manualBilinear ? { MANUAL_BILINEAR: '' } : {},
    polygonOffset: !!o.polygonOffset,
    polygonOffsetFactor: typeof o.polygonOffset === 'number' ? o.polygonOffset : o.polygonOffset ? -2 : 0,
    polygonOffsetUnits: typeof o.polygonOffset === 'number' ? o.polygonOffset : o.polygonOffset ? -2 : 0,
  });
  return m;
}
