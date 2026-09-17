const MASK_MAX = 72; // longest mask edge in cells — plenty for clicking a tail
const ALPHA_THRESHOLD = 24;

const cache = new Map();

/**
 * Downsamples a sprite's alpha channel into a boolean grid, then dilates it by
 * one cell so thin parts (tails, whiskers, ear tips) stay grabbable. This grid
 * is what makes the overlay click-through between a cat's legs rather than
 * across its whole bounding box.
 */
function buildMask(image) {
  const natural = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, MASK_MAX / natural);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  const raw = new Uint8Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = data[i * 4 + 3] > ALPHA_THRESHOLD ? 1 : 0;
  }

  const mask = new Uint8Array(raw.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!raw[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) mask[ny * width + nx] = 1;
        }
      }
    }
  }

  return { mask, width, height, content: contentBox(raw, width, height) };
}

/**
 * The opaque bounding box in 0..1 image coordinates. Cutouts usually carry a
 * transparent margin; measuring the cat itself is what stops it hovering above
 * the taskbar or sitting off-centre.
 */
function contentBox(raw, width, height) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!raw[y * width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }

  if (x1 < 0) return { x0: 0, y0: 0, x1: 1, y1: 1, width: 1, height: 1, centerX: 0.5 };

  const box = {
    x0: x0 / width,
    y0: y0 / height,
    x1: (x1 + 1) / width,
    y1: (y1 + 1) / height,
  };
  return {
    ...box,
    width: box.x1 - box.x0,
    height: box.y1 - box.y0,
    centerX: (box.x0 + box.x1) / 2,
  };
}

export async function loadPose(url) {
  const cached = cache.get(url);
  if (cached) return cached;

  const promise = (async () => {
    const image = new Image();
    image.src = url;
    await image.decode();

    const { mask, width, height, content } = buildMask(image);
    return {
      url,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      aspect: image.naturalWidth / image.naturalHeight,
      // The aspect of the cat itself, ignoring transparent margin.
      contentAspect: (content.width * image.naturalWidth) / (content.height * image.naturalHeight),
      mask,
      maskWidth: width,
      maskHeight: height,
      content,
    };
  })();

  cache.set(url, promise);
  return promise;
}

export function sampleMask(pose, u, v) {
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  const x = Math.min(pose.maskWidth - 1, Math.floor(u * pose.maskWidth));
  const y = Math.min(pose.maskHeight - 1, Math.floor(v * pose.maskHeight));
  return pose.mask[y * pose.maskWidth + x] === 1;
}

const REFERENCE_POSES = ['sit', 'idle', 'stand'];

/**
 * A default height multiplier per pose, so a cat works without anyone having to
 * measure their photos.
 *
 * Photos of different poses are framed differently, so one height cannot fit
 * them all — rendered at equal height a curled sleeping cat looks enormous next
 * to a sitting one. Holding the cat's on-screen *area* roughly constant fixes
 * that: something twice as wide should be about 1/sqrt(2) as tall. On a real
 * three-pose photo set this lands within a few percent of values tuned by hand.
 *
 * It is only a default. An explicit poseScale in cat.json always wins.
 */
export function deriveAutoScales(poses) {
  const names = Object.keys(poses);
  const reference = poses[REFERENCE_POSES.find((name) => poses[name]) ?? names[0]];
  if (!reference) return {};

  return Object.fromEntries(
    names.map((name) => {
      const ratio = reference.contentAspect / poses[name].contentAspect;
      return [name, Math.min(2, Math.max(0.25, Math.sqrt(ratio)))];
    }),
  );
}

export async function loadPoseSet(poseUrls) {
  const entries = await Promise.all(
    Object.entries(poseUrls).map(async ([name, url]) => {
      try {
        // Two pose names can share one file, so give each its own tagged view
        // of the cached sprite rather than mutating the shared object.
        return [name, { ...(await loadPose(url)), name }];
      } catch (error) {
        console.error(`[sprites] could not load pose "${name}" (${url}):`, error);
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter(Boolean));
}
