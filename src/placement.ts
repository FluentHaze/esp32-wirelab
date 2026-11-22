type Point = { x: number; y: number };
type AnchorPoint = Point & { id: string; valid: boolean };
type Nearest = { point: AnchorPoint; distance: number };

export function nearestAnchor(points: Iterable<AnchorPoint>, pointer: Point, radius: number) {
  let closest: Nearest | undefined;
  let valid: Nearest | undefined;
  for (const point of points) {
    const distance = Math.hypot(point.x - pointer.x, point.y - pointer.y);
    if (!closest || distance < closest.distance) closest = { point, distance };
    if (point.valid && (!valid || distance < valid.distance)) valid = { point, distance };
  }
  if (valid && valid.distance <= radius) return valid.point;
  if (closest && closest.distance <= radius) return closest.point;
}
