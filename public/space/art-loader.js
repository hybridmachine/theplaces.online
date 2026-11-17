import {SPACE_ART, artFiles} from '../../shared/lakeside-space-art.js';

// Loads the yard's art bundle as three textures. Surfaces repeat; panels and the card atlas clamp. All are sRGB with mipmaps.
// Rejects when any file fails to load, decodes to the wrong size, or the whole bundle takes longer than `timeoutMs`;
// textures made before then are disposed. Uses the browser's image decoder; three is passed in.
export function loadSpaceArt(THREE, renderer, art = SPACE_ART, {timeoutMs = 15000} = {}) {
  const files = artFiles(art), made = new Map(), images = [];
  const anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
  let settled = false;
  const disposeAll = () => { for (const t of made.values()) t.dispose(); made.clear(); };
  const texture = (image, {slot, alpha}) => {
    const t = new THREE.Texture(image);
    t.name = slot; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = anisotropy;
    const repeat = slot in art.surfaces;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    if (alpha) t.premultiplyAlpha = false; // the atlas is alpha-tested; its colour must not darken toward the cut edge
    t.needsUpdate = true;
    return t;
  };
  return new Promise((resolve, reject) => {
    const fail = error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      for (const image of images) { image.onload = image.onerror = null; image.src = ''; }
      disposeAll(); reject(error);
    };
    const timer = setTimeout(() => fail(new Error(`The yard's art did not load within ${timeoutMs} ms`)), timeoutMs);
    let left = files.length;
    for (const file of files) {
      const image = new Image(); images.push(image);
      image.decoding = 'async';
      image.onload = () => {
        if (settled) return;
        if (image.naturalWidth !== file.width || image.naturalHeight !== file.height)
          return fail(new Error(`${file.file} is ${image.naturalWidth} × ${image.naturalHeight}, expected ${file.width} × ${file.height}`));
        made.set(file.slot, texture(image, file));
        if (--left) return;
        settled = true; clearTimeout(timer);
        const surfaces = Object.fromEntries(Object.keys(art.surfaces).map(k => [k, made.get(k)]));
        const panels = Object.fromEntries(Object.keys(art.panels).map(k => [k, made.get(k)]));
        resolve({surfaces, panels, cards: made.get('cards'), dispose: disposeAll});
      };
      image.onerror = () => fail(new Error(`${file.file} could not be loaded`));
      image.src = art.base + file.file;
    }
  });
}
