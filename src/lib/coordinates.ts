export function normalizedToPixels(
  normalizedBox: [number, number, number, number],
  pageWidth: number,
  pageHeight: number
): { x: number; y: number; width: number; height: number } {
  const [ymin, xmin, ymax, xmax] = normalizedBox;
  
  const x = (xmin / 1000) * pageWidth;
  const y = (ymin / 1000) * pageHeight;
  const width = ((xmax - xmin) / 1000) * pageWidth;
  const height = ((ymax - ymin) / 1000) * pageHeight;

  return { x, y, width, height };
}

export function pixelsToNormalized(
  x: number,
  y: number,
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number
): [number, number, number, number] {
  const xmin = (x / pageWidth) * 1000;
  const ymin = (y / pageHeight) * 1000;
  const xmax = ((x + width) / pageWidth) * 1000;
  const ymax = ((y + height) / pageHeight) * 1000;

  return [
    Math.round(ymin),
    Math.round(xmin),
    Math.round(ymax),
    Math.round(xmax),
  ];
}
