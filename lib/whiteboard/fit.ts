export function fitBoard(
  viewW: number,
  viewH: number,
  boardW: number,
  boardH: number,
) {
  const zoom = Math.min(
    viewW / Math.max(1, boardW),
    viewH / Math.max(1, boardH),
  );
  return {
    zoom,
    zoomX: zoom,
    zoomY: zoom,
    panX: (viewW - boardW * zoom) / 2,
    panY: (viewH - boardH * zoom) / 2,
  };
}
