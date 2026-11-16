import {clockLabel} from '../shared/world.js';

export const NOTE_LIMIT = 160;
export const MAX_CAPTURE_EDGE = 2560;
const studies = {dawn:'Dawn', day:'Afternoon', dusk:'Dusk', night:'Night', rain:'Rain'};

// Metadata comes from the completed render, never a later clock sample.
export function captureMetadata(scene, calendar, {study=null, paused=false, disconnected=false, reconnecting=false, staticPainting=false, reducedMotion=false, capturedAt=Date.now()}={}) {
  const modes = [];
  if (study) modes.push(`Private light study: ${studies[study] ?? study}`);
  if (paused) modes.push('Paused view');
  if (!study && !paused && (disconnected || reconnecting) && calendar) modes.push('Last displayed view');
  if (disconnected && calendar) modes.push('Connection lost');
  else if (reconnecting && calendar) modes.push('Reconnecting');
  if (staticPainting || !calendar) modes.push('Static painting');
  if (!modes.length) modes.push('Live view');
  if (reducedMotion) modes.push('Reduced motion');
  const date = calendar ? `Year ${calendar.year} / Day ${calendar.dayOfYear+1} / ${clockLabel(calendar.hour)}` : 'World date unavailable';
  const dateLabel = study && calendar ? `Study time: ${date}` : date;
  const slug = String(scene.id).replace(/[^a-z0-9-]/gi, '-');
  const stamp = calendar ? `year-${calendar.year}-day-${calendar.dayOfYear+1}-${clockLabel(calendar.hour).replace(':','')}` : 'undated';
  const primaryMode = study ? `study-${study}` : paused ? 'paused' : !calendar ? 'static' : disconnected || reconnecting ? 'held' : staticPainting ? 'static' : 'live';
  const modeSlug = [...new Set([primaryMode,paused && study ? 'paused' : '',disconnected && calendar ? 'disconnected' : '',staticPainting && calendar ? 'static' : ''].filter(Boolean))].join('-');
  return Object.freeze({title:scene.title, region:scene.region, dateLabel, modeLabel:modes.join(' / '), capturedAt,
    filename:`${slug}-${stamp}-${modeSlug}-${capturedAt}.png`});
}

// Call synchronously after Painting.render, before the browser clears WebGL's
// non-preserved drawing buffer. No readback or extra drawing on ordinary frames.
export function captureFrame(painter, result, modes={}) {
  const {canvas:gpu, lifeCanvas, fallback} = painter;
  const style = getComputedStyle(gpu);
  const gpuOpacity = result && painter.ready && gpu.classList.contains('ready') && style.visibility !== 'hidden' ? Number(style.opacity) : 0;
  if (gpuOpacity>0 && painter.gl?.isContextLost()) throw new Error('Rendering context lost');
  const width = gpu.width, height = gpu.height;
  if (!width || !height || painter.disposed) throw new Error('No complete view');
  const ratio = Math.min(1, MAX_CAPTURE_EDGE / Math.max(width,height));
  const pixels = document.createElement('canvas');
  pixels.width = Math.max(1,Math.round(width*ratio));
  pixels.height = Math.max(1,Math.round(height*ratio));
  const ctx = pixels.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#24332f';ctx.fillRect(0,0,pixels.width,pixels.height);
  if (gpuOpacity < 1) {
    if (!fallback?.complete || !fallback.naturalWidth) throw new Error('Painting still loading');
    const scale = Math.max(painter.width/fallback.naturalWidth,painter.height/fallback.naturalHeight);
    const w = fallback.naturalWidth*scale, h = fallback.naturalHeight*scale;
    const left=(painter.width-w)*painter.pan,top=(painter.height-h)*.5;
    // CSS replaced images snap the two edges of the object-fit rectangle.
    // Snapping its width independently changes the crop by a visible fraction.
    const x=Math.round(left),y=Math.round(top),right=Math.round(left+w),bottom=Math.round(top+h);
    const sx=pixels.width/painter.width,sy=pixels.height/painter.height;
    ctx.drawImage(fallback,x*sx,y*sy,(right-x)*sx,(bottom-y)*sy);
  }
  if (gpuOpacity > 0) { ctx.globalAlpha=gpuOpacity;ctx.drawImage(gpu,0,0,pixels.width,pixels.height);ctx.globalAlpha=1; }
  if (result) ctx.drawImage(lifeCanvas,0,0,pixels.width,pixels.height);
  // Same scene shading as .edge-shade, without any chrome, welcome or dialogs.
  const shade = ctx.createLinearGradient(0,0,0,pixels.height);
  for (const [stop,color] of [[0,'rgba(12,22,17,.24)'],[.19,'transparent'],[.67,'transparent'],[1,'rgba(12,22,17,.55)']]) shade.addColorStop(stop,color);
  ctx.fillStyle=shade;ctx.fillRect(0,0,pixels.width,pixels.height);
  return {pixels, metadata:captureMetadata(painter.scene,result?.calendar,{...modes,staticPainting:gpuOpacity<1,reducedMotion:!painter.motion})};
}

// Measure words and split a long unbroken word by Unicode code point. Notes are
// plain text, so neither HTML nor a newline can change the caption's structure.
export function wrapCaption(text, width, measure) {
  const lines=[];let line='';
  for (const word of text.trim().split(/\s+/u).filter(Boolean)) {
    if (line && measure(`${line} ${word}`) <= width) { line+=` ${word}`;continue; }
    if (line) { lines.push(line);line=''; }
    for (const char of word) {
      if (line && measure(line+char)>width) { lines.push(line);line=''; }
      line+=char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawPostcard(capture, note='') {
  if (note.length>NOTE_LIMIT) throw new Error('Note too long');
  const {pixels,metadata:m}=capture;
  const card=document.createElement('canvas'),ctx=card.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const pad=Math.max(18,Math.round(pixels.width*.035));
  const size=Math.max(16,Math.min(36,pixels.width/34));
  const textWidth=pixels.width;
  const groups=[
    {text:m.title,font:`${size*1.35}px Georgia, serif`,color:'#293930',step:size*1.65},
    {text:m.region,font:`${size*.8}px Arial, sans-serif`,color:'#526052',step:size*1.1},
    {text:m.dateLabel,font:`${size*.8}px Arial, sans-serif`,color:'#526052',step:size*1.1},
    {text:m.modeLabel,font:`${size*.8}px Arial, sans-serif`,color:'#526052',step:size*1.1},
    {text:note.trim(),font:`${size}px Georgia, serif`,color:'#293930',step:size*1.35},
  ].filter(g=>g.text);
  for (const group of groups) { ctx.font=group.font;group.lines=wrapCaption(group.text,textWidth,s=>ctx.measureText(s).width); }
  const captionHeight=groups.reduce((sum,g)=>sum+g.lines.length*g.step+size*.3,0);
  card.width=pixels.width+2*pad;card.height=Math.ceil(pixels.height+3*pad+captionHeight);
  ctx.fillStyle='#f3f0e6';ctx.fillRect(0,0,card.width,card.height);
  ctx.drawImage(pixels,pad,pad);ctx.textBaseline='top';
  let y=pixels.height+2*pad;
  for (const group of groups) {
    ctx.font=group.font;ctx.fillStyle=group.color;
    for (const line of group.lines) { ctx.fillText(line,pad,y);y+=group.step; }
    y+=size*.3;
  }
  return card;
}

export function pngBlob(canvas) {
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(new Error('PNG encoding failed')),'image/png'));
}
