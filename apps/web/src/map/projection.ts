/** Equirectangular (plate carrée) projection helpers for the 2D map, matching the LROC color map layout. */
export function project(lat: number, lon: number, width: number, height: number): { x: number; y: number } {
  return { x: ((lon + 180) / 360) * width, y: ((90 - lat) / 180) * height };
}
export function unproject(x: number, y: number, width: number, height: number): { lat: number; lon: number } {
  return { lon: (x / width) * 360 - 180, lat: 90 - (y / height) * 180 };
}
