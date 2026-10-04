import { AdditiveBlending, FrontSide, ShaderMaterial, Texture, Vector3 } from 'three';

/**
 * Earth surface shader — NASA Blue Marble (day) + Black Marble (night lights) + Blue Marble cloud cover, lit by the
 * scene Sun direction with a soft terminator, a Fresnel atmosphere rim and a faint ocean glint.
 * Works with the logarithmic depth buffer like the Moon materials.
 */
const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform float uHasNight;
uniform float uHasClouds;
uniform vec3 uSunDir;
uniform float uNightBoost;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float ndl = dot(n, uSunDir);
  float diffuse = max(ndl, 0.0);
  float day = smoothstep(-0.06, 0.14, ndl);            // terminator width ≈ 11°
  vec3 dayCol = texture2D(uDay, vUv).rgb;
  float cloud = uHasClouds > 0.5 ? texture2D(uClouds, vUv).r : 0.0;
  vec3 nightCol = uHasNight > 0.5 ? texture2D(uNight, vUv).rgb : vec3(0.0);

  // ocean glint (rough mask: blue-dominant, dark pixels of the day map)
  float ocean = smoothstep(0.02, 0.12, dayCol.b - max(dayCol.r, dayCol.g));
  vec3 h = normalize(uSunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 90.0) * ocean * 0.5;

  vec3 lit = dayCol * (diffuse * 1.25 + 0.015) + vec3(1.0, 0.97, 0.9) * spec * day;
  vec3 cloudLit = vec3(1.0) * (diffuse * 1.15 + 0.02);
  lit = mix(lit, cloudLit, cloud * 0.92);
  vec3 night = nightCol * uNightBoost * (1.0 - cloud * 0.7) + dayCol * 0.006;
  vec3 col = mix(night, lit, day);

  // atmosphere: thin Fresnel rim, blue on the day side, fading through the terminator
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.2);
  col += vec3(0.32, 0.52, 1.0) * fres * (0.12 + 0.88 * smoothstep(-0.25, 0.35, ndl)) * 0.75;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function createEarthMaterial(day: Texture, night: Texture | null, clouds: Texture | null): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uDay: { value: day },
      uNight: { value: night ?? day },
      uClouds: { value: clouds ?? day },
      uHasNight: { value: night ? 1 : 0 },
      uHasClouds: { value: clouds ? 1 : 0 },
      uSunDir: { value: new Vector3(1, 0, 0) },
      uNightBoost: { value: 1.6 },
    },
    side: FrontSide,
  });
}

/** Additive limb glow on a slightly larger sphere — the atmosphere seen beyond the Earth's edge. */
const glowFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float edge = 1.0 - abs(dot(n, v));
  float rim = pow(edge, 6.0);
  float lit = smoothstep(-0.35, 0.3, dot(n, uSunDir));
  gl_FragColor = vec4(vec3(0.35, 0.55, 1.0) * rim * (0.08 + 0.92 * lit) * 0.9, 1.0);
  #include <colorspace_fragment>
}
`;

export function createAtmosphereMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader: glowFragment,
    uniforms: { uSunDir: { value: new Vector3(1, 0, 0) } },
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: FrontSide,
  });
}
