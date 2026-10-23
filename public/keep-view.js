import {captureFrame,drawPostcard,pngBlob,NOTE_LIMIT} from './view-capture.js';

export class KeepView {
  constructor({root=document,onDownload=()=>{}}={}) {
    const $=id=>root.querySelector(`#keep-${id}`);
    this.dialog=$('dialog');this.button=$('button');this.preview=$('preview');
    this.details=$('details');this.status=$('status');this.note=$('note');this.count=$('count');
    this.download=$('download');this.openImage=$('open-image');this.lastImage=$('last-image');
    this.retryCapture=$('retry-capture');this.retryExport=$('retry-export');
    this.session=0;this.version=0;this.pending=false;this.capture=null;this.prepared=null;this.lastURL=null;
    this.onDownload=onDownload;
    this.fitViewport=()=>{
      const view=globalThis.visualViewport;
      this.dialog.style.setProperty('--keep-height',`${view?.height ?? innerHeight}px`);
      this.dialog.style.setProperty('--keep-middle',`${(view?.offsetTop ?? 0)+(view?.height ?? innerHeight)/2}px`);
    };
    globalThis.visualViewport?.addEventListener('resize',this.fitViewport);
    globalThis.visualViewport?.addEventListener('scroll',this.fitViewport);
    this.button.addEventListener('click',()=>this.open());
    $('cancel').addEventListener('click',()=>this.dialog.close());
    this.dialog.addEventListener('close',()=>this.closed());
    this.dialog.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const controls=[...this.dialog.querySelectorAll('button,a[href],textarea')].filter(element=>!element.disabled&&element.getClientRects().length);
      if(!controls.length)return;
      const active=this.dialog.ownerDocument.activeElement;
      if(!controls.includes(active)||active===(event.shiftKey?controls[0]:controls.at(-1))){
        event.preventDefault();(event.shiftKey?controls.at(-1):controls[0]).focus();
      }
    });
    this.retryCapture.addEventListener('click',()=>this.requestCapture());
    this.retryExport.addEventListener('click',()=>this.prepare());
    this.note.addEventListener('input',()=>this.changed());
    this.download.addEventListener('click',()=>this.save());
  }
  open() {
    if (this.dialog.open) return;
    this.session++;this.note.value='';this.count.textContent=`0 / ${NOTE_LIMIT}`;
    this.fitViewport();this.dialog.showModal();this.requestCapture();
  }
  requestCapture() {
    this.pending=true;this.details.hidden=true;this.retryCapture.hidden=true;this.retryExport.hidden=true;
    this.clearPrepared();this.status.textContent='Preparing this view…';
  }
  // app.js calls this once at the end of the next complete render. All later
  // edits and retries operate on the private pixels, even while the world moves.
  rendered(painter,result,modes) {
    if (!this.pending || !this.dialog.open) return;
    this.pending=false;
    try {
      this.capture=captureFrame(painter,result,modes);
      const {pixels,metadata:m}=this.capture;
      this.preview.width=pixels.width;this.preview.height=pixels.height;
      this.preview.getContext('2d').drawImage(pixels,0,0);
      this.preview.setAttribute('aria-label',`${m.title}. ${m.dateLabel}. ${m.modeLabel}.`);
      for (const [id,value] of [['title',m.title],['region',m.region],['date',m.dateLabel],['mode',m.modeLabel]]) this.dialog.querySelector(`#keep-${id}`).textContent=value;
      this.details.hidden=false;this.status.textContent='';this.prepare();
    } catch {
      this.status.textContent='We could not prepare this view. Try capturing it again.';
      this.retryCapture.hidden=false;
    }
  }
  clearPrepared() {
    this.version++;clearTimeout(this.timer);
    if (this.prepared) URL.revokeObjectURL(this.prepared.url);
    this.prepared=null;this.download.disabled=true;this.openImage.hidden=true;this.openImage.removeAttribute('href');
  }
  changed() {
    this.clearPrepared();this.retryExport.hidden=true;
    this.count.textContent=`${this.note.value.length} / ${NOTE_LIMIT}`;
    const invalid=this.note.value.length>NOTE_LIMIT;
    this.note.setAttribute('aria-invalid',String(invalid));
    this.status.textContent=invalid ? `Keep your note to ${NOTE_LIMIT} characters.` : 'Preparing image…';
    if (!invalid) this.timer=setTimeout(()=>this.prepare(),150);
  }
  async prepare() {
    this.clearPrepared();this.retryExport.hidden=true;
    if (!this.capture || !this.dialog.open || this.note.value.length>NOTE_LIMIT) return;
    const session=this.session,version=this.version;
    this.status.textContent='Preparing image…';let card;
    try {
      card=drawPostcard(this.capture,this.note.value);
      const blob=await pngBlob(card);
      if (session!==this.session || version!==this.version || !this.dialog.open) return;
      this.prepared={url:URL.createObjectURL(blob),filename:this.capture.metadata.filename};
      this.openImage.href=this.prepared.url;this.openImage.hidden=false;
      this.download.disabled=false;this.status.textContent='';
    } catch {
      if (session!==this.session || version!==this.version || !this.dialog.open) return;
      this.status.textContent='We could not prepare the download. Your view and note are still here.';
      this.retryExport.hidden=false;
    } finally { if (card) { card.width=1;card.height=1; } }
  }
  save() {
    if (!this.prepared || !this.dialog.open) return;
    const {url,filename}=this.prepared;
    const link=document.createElement('a');link.href=url;link.download=filename;
    try {
      // Encoding finishes before the click, preserving user activation on phones.
      document.body.append(link);link.click();
    } catch {
      this.status.textContent='The download could not start. Try again or choose Open image.';
      return;
    } finally { link.remove(); }
    if (this.lastURL) URL.revokeObjectURL(this.lastURL);
    this.lastURL=url;this.prepared=null;
    this.lastImage.href=url;this.lastImage.hidden=false;
    this.dialog.close();this.onDownload(url);
  }
  closed() {
    if(this.dialog.open)return;
    this.session++;this.pending=false;this.clearPrepared();
    if (this.capture) { this.capture.pixels.width=1;this.capture.pixels.height=1; }
    this.capture=null;this.preview.width=1;this.preview.height=1;this.details.hidden=true;
    this.note.value='';this.note.removeAttribute('aria-invalid');
    this.button.focus({preventScroll:true});
  }
  dispose() {
    globalThis.visualViewport?.removeEventListener('resize',this.fitViewport);
    globalThis.visualViewport?.removeEventListener('scroll',this.fitViewport);
    this.session++;this.pending=false;this.clearPrepared();
    if (this.lastURL) URL.revokeObjectURL(this.lastURL);
    this.lastURL=null;this.capture=null;
  }
}
