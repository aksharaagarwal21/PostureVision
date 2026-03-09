export function calculateAngle(A, B, C) {
  const AB = {
    x: A.x - B.x,
    y: A.y - B.y
  };

  const CB = {
    x: C.x - B.x,
    y: C.y - B.y
  };

  const dotProduct =
    AB.x * CB.x +
    AB.y * CB.y;

  const magnitudeAB =
    Math.sqrt(AB.x * AB.x + AB.y * AB.y);

  const magnitudeCB =
    Math.sqrt(CB.x * CB.x + CB.y * CB.y);

  const angle =
    Math.acos(dotProduct / (magnitudeAB * magnitudeCB));

  return (angle * 180) / Math.PI;
}