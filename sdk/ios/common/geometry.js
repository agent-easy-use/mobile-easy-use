function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Normalize both ObjC bridge CGRect shapes used by supported Frida runtimes. */
function rectValue(rect) {
  const origin = rect?.origin ?? rect?.[0];
  const size = rect?.size ?? rect?.[1];
  const x = numberOrNull(origin?.x ?? origin?.[0]);
  const y = numberOrNull(origin?.y ?? origin?.[1]);
  const width = numberOrNull(size?.width ?? size?.[0]);
  const height = numberOrNull(size?.height ?? size?.[1]);
  return x === null || y === null || width === null || height === null
    ? null
    : { x, y, width, height };
}

export { rectValue };
