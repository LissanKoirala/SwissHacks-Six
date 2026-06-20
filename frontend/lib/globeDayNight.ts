/** Live day/night shading for globe.gl (based on vasturiano/globe.gl day-night-cycle example). */
import { ShaderMaterial, Texture, TextureLoader, Vector2 } from "three";

const DAY_NIGHT_VERTEX = `
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DAY_NIGHT_FRAGMENT = `
#define PI 3.141592653589793
uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec2 sunPosition;
uniform vec2 globeRotation;
varying vec3 vNormal;
varying vec2 vUv;

float toRad(in float a) {
  return a * PI / 180.0;
}

vec3 Polar2Cartesian(in vec2 c) {
  float theta = toRad(90.0 - c.x);
  float phi = toRad(90.0 - c.y);
  return vec3(
    sin(phi) * cos(theta),
    cos(phi),
    sin(phi) * sin(theta)
  );
}

void main() {
  float invLon = toRad(globeRotation.x);
  float invLat = -toRad(globeRotation.y);
  mat3 rotX = mat3(
    1, 0, 0,
    0, cos(invLat), -sin(invLat),
    0, sin(invLat), cos(invLat)
  );
  mat3 rotY = mat3(
    cos(invLon), 0, sin(invLon),
    0, 1, 0,
    -sin(invLon), 0, cos(invLon)
  );
  vec3 rotatedSunDirection = rotX * rotY * Polar2Cartesian(sunPosition);
  float intensity = dot(normalize(vNormal), normalize(rotatedSunDirection));
  vec4 dayColor = texture2D(dayTexture, vUv);
  vec4 nightColor = texture2D(nightTexture, vUv);
  float blendFactor = smoothstep(-0.1, 0.1, intensity);
  gl_FragColor = mix(nightColor, dayColor, blendFactor);
}
`;

/** Subsolar point [lng, lat] in degrees for a UTC timestamp. */
export function sunPositionAt(date: Date): [number, number] {
  const ms = date.getTime();
  const dayStart = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const t = (ms - Date.UTC(2000, 0, 1, 12)) / 31557600000;
  const decl =
    Math.asin(Math.sin(((t * 0.98560028 + 357.528) * Math.PI) / 180) * 0.39779) *
    (180 / Math.PI);
  const eot =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(((t * 0.98560028 + 357.528) * Math.PI) / 180) -
      0.032077 * Math.sin(((t * 0.98560028 + 357.528) * Math.PI) / 180) -
      0.014615 * Math.cos(((t * 1.971 + 354.34) * Math.PI) / 180) -
      0.040849 * Math.sin(((t * 1.971 + 354.34) * Math.PI) / 180));
  const lng = ((dayStart - ms) / 86400000) * 360 - 180 - eot / 4;
  return [lng, decl];
}

let texturePromise: Promise<[Texture, Texture]> | null = null;

export function loadDayNightTextures(): Promise<[Texture, Texture]> {
  if (!texturePromise) {
    const loader = new TextureLoader();
    texturePromise = Promise.all([
      loader.loadAsync("/textures/earth-day.jpg"),
      loader.loadAsync("/textures/earth-night.jpg"),
    ]);
  }
  return texturePromise;
}

export function createDayNightMaterial(
  dayTexture: Texture,
  nightTexture: Texture,
): ShaderMaterial {
  const material = new ShaderMaterial({
    uniforms: {
      dayTexture: { value: dayTexture },
      nightTexture: { value: nightTexture },
      sunPosition: { value: new Vector2() },
      globeRotation: { value: new Vector2() },
    },
    vertexShader: DAY_NIGHT_VERTEX,
    fragmentShader: DAY_NIGHT_FRAGMENT,
  });
  const [lng, lat] = sunPositionAt(new Date());
  material.uniforms.sunPosition.value.set(lng, lat);
  return material;
}

export function updateSunPosition(material: ShaderMaterial, date = new Date()) {
  const [lng, lat] = sunPositionAt(date);
  material.uniforms.sunPosition.value.set(lng, lat);
}

export function updateGlobeRotation(
  material: ShaderMaterial,
  lng: number,
  lat: number,
) {
  material.uniforms.globeRotation.value.set(lng, lat);
}
