import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import studioCylinder from '@/assets/cgd-studio-cylinder.webp';
import cityRider from '@/assets/cgd-city-rider.webp';
import sellerPortrait from '@/assets/cgd-seller-portrait.webp';
import deliveryHandover from '@/assets/cgd-delivery-handover.webp';
import './ColumnSpreadShowcase.css';

const IMAGE_SOURCES = [studioCylinder, cityRider, sellerPortrait, deliveryHandover];
const LOOP_SECONDS = 8;
const DPR_CAP = 2;
const SLOT_COUNT = 12;
const COLUMN_COUNT = 3;
const STACK_SCALE = 0.5;
const CAMERA_ZOOM = 0.5;
const ROW_DELAY = 0.04;
const DRIFT = 0.16;
const SPREAD_IN = [0.08, 0.22];
const SPREAD_OUT = [0.7, 0.84];

type Rect = { x: number; y: number; w: number; h: number };
type Column = {
  spread: number;
  origin: number;
  laneAlong: number;
  anchorAlong: number;
  across: number;
  far: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;
const remap = (value: number, start: number, end: number) => end <= start ? (value >= end ? 1 : 0) : clamp01((value - start) / (end - start));
const easeInOutCubic = (value: number) => value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

function gcd(first: number, second: number): number {
  while (second) [first, second] = [second, first % second];
  return first;
}

function nearestReach(first: number, second: number, count: number) {
  for (let distance = 0; distance <= count; distance++) {
    if (modulo(first - distance * second, count) === 0 || modulo(first + distance * second, count) === 0) return distance;
  }
  return count;
}

function seededRandom(seed: number) {
  let current = seed >>> 0;
  return () => {
    current = (current + 1831565813) | 0;
    let next = Math.imul(current ^ (current >>> 15), 1 | current);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

const permutationCache = new Map<string, (column: number, card: number) => number>();

function slotPermutation(count: number, rows: number, columns: number) {
  const key = `${count}:${rows}:${columns}`;
  const cached = permutationCache.get(key);
  if (cached) return cached;
  const total = Math.max(1, count);
  let best = { a: 1, b: 1, spread: -1, gap: -1, reach: -1 };
  for (let b = 1; b <= total; b++) {
    const gap = Math.min(total / gcd(b, total), rows);
    for (let a = 1; a <= total; a++) {
      const spread = Math.min(total / gcd(a, total), columns);
      const reach = nearestReach(a, b, total);
      if (spread > best.spread || (spread === best.spread && (gap > best.gap || (gap === best.gap && reach > best.reach)))) {
        best = { a, b, spread, gap, reach };
      }
    }
  }
  const shuffled = Array.from({ length: total }, (_, index) => index);
  const random = seededRandom(total);
  for (let index = total - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const mapSlot = (column: number, card: number) => shuffled[modulo(best.a * column + best.b * card, total)];
  permutationCache.set(key, mapSlot);
  return mapSlot;
}

function roundedRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number) {
  const corner = Math.max(0, Math.min(radius, rect.w / 2, rect.h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, corner);
    return;
  }
  ctx.moveTo(rect.x + corner, rect.y);
  ctx.arcTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, corner);
  ctx.arcTo(rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h, corner);
  ctx.arcTo(rect.x, rect.y + rect.h, rect.x, rect.y, corner);
  ctx.arcTo(rect.x, rect.y, rect.x + rect.w, rect.y, corner);
  ctx.closePath();
}

function drawCard(ctx: CanvasRenderingContext2D, image: HTMLImageElement | undefined, slot: number, rect: Rect, radius: number) {
  if (rect.w <= 0 || rect.h <= 0) return;
  ctx.save();
  roundedRect(ctx, rect, radius);
  ctx.clip();
  if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
    const scale = Math.max(rect.w / image.naturalWidth, rect.h / image.naturalHeight);
    const sourceWidth = rect.w / scale;
    const sourceHeight = rect.h / scale;
    const sourceX = (image.naturalWidth - sourceWidth) / 2;
    const sourceY = (image.naturalHeight - sourceHeight) / 2;
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, rect.x, rect.y, rect.w, rect.h);
  } else {
    ctx.fillStyle = `hsl(230, 6%, ${30 + (slot * 11) % 30}%)`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();
}

function renderSpread(ctx: CanvasRenderingContext2D, progress: number, width: number, height: number, images: Array<HTMLImageElement | undefined>) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const unit = Math.min(width, height) / 100;
  const inset = unit * 6;
  const content: Rect = { x: inset, y: inset, w: width - inset * 2, h: height - inset * 2 };
  const radius = unit * 3;
  const mapSlot = slotPermutation(Math.max(1, images.length), SLOT_COUNT, COLUMN_COUNT);
  const rowGap = unit * 3;
  const cardGap = unit * 3;
  const middleColumn = (COLUMN_COUNT - 1) / 2;
  const along = height;
  const available = content.w;
  const start = content.x;
  const drift = content.h * DRIFT;
  const columnSize = (available + rowGap) / COLUMN_COUNT;
  const cardSize = Math.max(1, columnSize - rowGap);
  const cardWidth = cardSize;
  const cardHeight = cardSize;
  const spacing = cardHeight + cardGap;
  const camera = 1 + CAMERA_ZOOM * (1 - easeInOutCubic(remap(progress, 0, 0.42)) + easeInOutCubic(remap(progress, 0.9, 1)));

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera, camera);
  ctx.translate(-width / 2, -height / 2);

  const columns: Column[] = Array.from({ length: COLUMN_COUNT }, (_, column) => {
    const phase = column * ROW_DELAY;
    const spread = easeInOutCubic(remap(progress, SPREAD_IN[0] + phase, SPREAD_IN[1] + phase))
      - easeInOutCubic(remap(progress, SPREAD_OUT[0] + phase, SPREAD_OUT[1] + phase));
    const origin = (SLOT_COUNT - 1) / 2;
    const laneAlong = along / 2 + (column % 2 ? -1 : 1) * drift * Math.sin(2 * Math.PI * progress);
    const anchorAlong = along / 2;
    const columnCenter = start + column * columnSize + cardSize / 2;
    return {
      spread,
      origin,
      laneAlong,
      anchorAlong,
      across: lerp(width / 2, columnCenter, spread),
      far: Math.max(origin, SLOT_COUNT - 1 - origin) || 1,
    };
  });
  const cards = columns.flatMap((column, columnIndex) =>
    Array.from({ length: SLOT_COUNT }, (_, cardIndex) => ({ columnIndex, cardIndex, distance: Math.abs(cardIndex - column.origin) })),
  );
  cards.sort((first, second) => second.distance - first.distance);

  for (const { columnIndex, cardIndex, distance } of cards) {
    const column = columns[columnIndex];
    const targetAlong = column.laneAlong + (cardIndex - (SLOT_COUNT - 1) / 2) * spacing;
    const size = lerp(lerp(1, STACK_SCALE, distance / column.far), 1, column.spread);
    const cardAlong = lerp(column.anchorAlong, targetAlong, column.spread);
    const scaledWidth = cardWidth * size;
    const scaledHeight = cardHeight * size;
    if (cardAlong + scaledHeight / 2 < 0 || cardAlong - scaledHeight / 2 > along) continue;
    const slot = mapSlot(columnIndex, cardIndex);
    drawCard(ctx, images[slot % images.length], slot, {
      x: column.across - scaledWidth / 2,
      y: cardAlong - scaledHeight / 2,
      w: scaledWidth,
      h: scaledHeight,
    }, radius * size);
  }
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#0c0b10';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export default function ColumnSpreadShowcase() {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const updateRef = useRef<(() => void) | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!root || !canvas || !ctx) return;
    let phase = 0.12;
    let previousTime = performance.now();
    let frame = 0;
    let visible = false;
    let hovered = false;
    let focused = false;
    let disposed = false;
    const images: Array<HTMLImageElement | undefined> = Array(SLOT_COUNT).fill(undefined);
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const draw = () => {
      if (canvas.width && canvas.height) renderSpread(ctx, phase, canvas.width, canvas.height, images);
    };
    const tick = (now: number) => {
      const elapsed = Math.min(0.05, Math.max(0, (now - previousTime) / 1000));
      previousTime = now;
      phase = (phase + elapsed / LOOP_SECONDS) % 1;
      draw();
      frame = requestAnimationFrame(tick);
    };
    const update = () => {
      const canRun = visible && !document.hidden && !motionQuery.matches && !pausedRef.current && !hovered && !focused;
      if (canRun && !frame) {
        previousTime = performance.now();
        frame = requestAnimationFrame(tick);
      } else if (!canRun && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        draw();
      }
    };
    updateRef.current = update;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      canvas.width = Math.round(root.clientWidth * dpr);
      canvas.height = Math.round(root.clientHeight * dpr);
      draw();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    resize();

    IMAGE_SOURCES.forEach((source, index) => {
      const image = new Image();
      image.onload = () => {
        if (disposed) return;
        for (let slot = index; slot < SLOT_COUNT; slot += IMAGE_SOURCES.length) images[slot] = image;
        draw();
      };
      image.src = source;
    });

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    }, { threshold: 0.01 });
    intersectionObserver.observe(root);
    const onPointerEnter = () => { hovered = true; update(); };
    const onPointerLeave = () => { hovered = false; update(); };
    const onFocusIn = () => { focused = true; update(); };
    const onFocusOut = (event: FocusEvent) => {
      if (!root.contains(event.relatedTarget as Node | null)) { focused = false; update(); }
    };
    const onMotionChange = () => {
      setReducedMotion(motionQuery.matches);
      if (motionQuery.matches) phase = 0.12;
      draw();
      update();
    };
    canvas.addEventListener('pointerenter', onPointerEnter);
    canvas.addEventListener('pointerleave', onPointerLeave);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    motionQuery.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', update);
    setReducedMotion(motionQuery.matches);

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener('pointerenter', onPointerEnter);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      motionQuery.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', update);
      updateRef.current = null;
    };
  }, []);

  const togglePaused = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    updateRef.current?.();
  };

  return (
    <figure className="cgd-column-spread" ref={rootRef} aria-label="CGD cooking gas delivery image showcase">
      <canvas ref={canvasRef} role="img" aria-label="Cooking gas cylinder, delivery rider, seller shop and handover photographs moving between a stack and three columns" />
      <button
        type="button"
        className="cgd-column-spread-control"
        aria-label={reducedMotion ? 'Motion disabled by your device settings' : paused ? 'Play image showcase' : 'Pause image showcase'}
        aria-pressed={paused}
        disabled={reducedMotion}
        onClick={togglePaused}
        onPointerUp={(event) => event.currentTarget.blur()}
      >
        {paused || reducedMotion ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
        <span>{reducedMotion ? 'Motion off' : paused ? 'Play motion' : 'Pause motion'}</span>
      </button>
    </figure>
  );
}
