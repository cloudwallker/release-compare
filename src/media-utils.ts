export interface RasterInfo { mime: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number }
export function checkOutputBudget(bytes:number):void {
  if(bytes>64*1024*1024)throw Object.assign(new Error('The GIF exceeds 64 MiB. Reduce output width, duration or frame rate.'),{code:'capacity'});
}
const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
const invalid = (): never => { throw new Error('Use a static PNG, JPEG or WebP image within the image limits.'); };
const dimensions = (mime: RasterInfo['mime'], width: number, height: number): RasterInfo => {
  if (!width || !height || width > 4096 || height > 4096 || width * height > 8_000_000) invalid();
  return { mime, width, height };
};

/** Inspect headers before handing compressed input to the browser decoder. */
export function inspectRaster(bytes: Uint8Array): RasterInfo {
  if (bytes.length > 4 * 1024 * 1024 || bytes.length < 12) invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if ([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) {
    if (bytes.length < 33 || view.getUint32(8) !== 13 || ascii(bytes,12,4) !== 'IHDR') invalid();
    for (let pos=8; pos+12<=bytes.length;) {
      const length=view.getUint32(pos); if (pos+12+length>bytes.length) invalid();
      if (ascii(bytes,pos+4,4)==='acTL') invalid();
      pos+=12+length;
    }
    return dimensions('image/png',view.getUint32(16),view.getUint32(20));
  }
  if (bytes[0]===0xff && bytes[1]===0xd8) {
    let pos=2;
    while (pos<bytes.length) {
      if (bytes[pos++]!==0xff) invalid();
      while (bytes[pos]===0xff) pos++;
      const marker=bytes[pos++];
      if (marker===0xd9 || marker===0xda || marker===undefined) invalid();
      if (marker===0x01 || (marker>=0xd0 && marker<=0xd7)) continue;
      if (pos+2>bytes.length) invalid();
      const length=view.getUint16(pos); if (length<2 || pos+length>bytes.length) invalid();
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (length<8) invalid();
        return dimensions('image/jpeg',view.getUint16(pos+5),view.getUint16(pos+3));
      }
      pos+=length;
    }
    invalid();
  }
  if (ascii(bytes,0,4)==='RIFF' && ascii(bytes,8,4)==='WEBP') {
    if (view.getUint32(4,true)+8!==bytes.length) invalid();
    for (let pos=12;pos+8<=bytes.length;) {
      const type=ascii(bytes,pos,4), length=view.getUint32(pos+4,true), start=pos+8;
      if (start+length>bytes.length) invalid();
      if (type==='VP8X') {
        if (length<10 || (bytes[start]&2)) invalid();
        const u24=(offset:number)=>bytes[offset]+bytes[offset+1]*256+bytes[offset+2]*65536;
        return dimensions('image/webp',u24(start+4)+1,u24(start+7)+1);
      }
      if (type==='VP8L') {
        if (length<5 || bytes[start]!==0x2f) invalid();
        const bits=view.getUint32(start+1,true);
        return dimensions('image/webp',(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);
      }
      if (type==='VP8 ') {
        if (length<10 || bytes[start+3]!==0x9d || bytes[start+4]!==1 || bytes[start+5]!==0x2a) invalid();
        return dimensions('image/webp',view.getUint16(start+6,true)&0x3fff,view.getUint16(start+8,true)&0x3fff);
      }
      pos=start+length+(length%2);
    }
  }
  return invalid();
}

/** Wrap at grapheme boundaries. An ellipsis explicitly marks overflow. */
export function wrapLines(text: string, maxWidth: number, maxLines: number, measure: (s:string)=>number): string[] {
  if (!text.trim() || maxLines<1 || maxWidth<=0) return [];
  const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
  const units=Array.from(segmenter.segment(text.replace(/[^\S\n]+/g,' ').trim()),s=>s.segment);
  const lines:string[]=[]; let line=''; let truncated=false;
  for(let i=0;i<units.length;i++) {
    const unit=units[i];
    if(unit==='\n' || (line && measure(line+unit)>maxWidth)) {
      lines.push(line.trimEnd()); line='';
      if(lines.length===maxLines) { truncated=true; break; }
      if(unit==='\n') continue;
    }
    if(!line && unit===' ') continue;
    line+=unit;
  }
  if(line && lines.length<maxLines) lines.push(line.trimEnd());
  if(truncated && lines.length) {
    const chars=Array.from(segmenter.segment(lines.at(-1)!),s=>s.segment);
    while(chars.length && measure(chars.join('')+'…')>maxWidth) chars.pop();
    lines[lines.length-1]=chars.join('')+'…';
  }
  return lines;
}
