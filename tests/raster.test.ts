import { describe, expect, it } from 'vitest';
import { inspectRaster, wrapLines, checkOutputBudget } from '../src/media-utils';

const png = (w: number, h: number) => {
  const b = new Uint8Array(33); b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); b[24]=8; b[25]=6; return b;
};
describe('raster input headers', () => {
  it('reads dimensions before a huge image could be decoded', () => expect(inspectRaster(png(4000,2000))).toEqual({mime:'image/png',width:4000,height:2000}));
  it('rejects over-budget dimensions', () => expect(()=>inspectRaster(png(4096,4096))).toThrow());
  it('rejects a truncated PNG header', () => expect(()=>inspectRaster(png(10,10).slice(0,22))).toThrow());
  it('rejects SVG regardless of the filename or claimed MIME', () => expect(()=>inspectRaster(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toThrow());
  it('reads JPEG SOF dimensions after an APP segment', () => {
    const b=new Uint8Array([255,216,255,224,0,4,0,0,255,192,0,11,8,0,20,0,30,1,1,17,0,255,217]);
    expect(inspectRaster(b)).toEqual({mime:'image/jpeg',width:30,height:20});
  });
  it('rejects corrupt JPEG segment bounds', () => expect(()=>inspectRaster(new Uint8Array([255,216,255,224,0,100]))).toThrow());
  it('reads lossless WebP dimensions', () => {
    const b=new Uint8Array(26); b.set(new TextEncoder().encode('RIFF'),0); new DataView(b.buffer).setUint32(4,18,true);
    b.set(new TextEncoder().encode('WEBPVP8L'),8); new DataView(b.buffer).setUint32(16,5,true); b[20]=0x2f;
    new DataView(b.buffer).setUint32(21, (19<<14)|29,true);
    expect(inspectRaster(b)).toEqual({mime:'image/webp',width:30,height:20});
  });
  it('rejects animated WebP', () => {
    const b=new Uint8Array(30); b.set(new TextEncoder().encode('RIFF'),0); new DataView(b.buffer).setUint32(4,22,true);
    b.set(new TextEncoder().encode('WEBPVP8X'),8); new DataView(b.buffer).setUint32(16,10,true); b[20]=2;
    expect(()=>inspectRaster(b)).toThrow();
  });
});

describe('caption lines', () => {
  const measure=(s:string)=>Array.from(s).length*10;
  it('wraps Chinese text by graphemes',()=>expect(wrapLines('搜索体验更新，快速找到任务',50,3,measure)).toEqual(['搜索体验更','新，快速找','到任务']));
  it('respects explicit line breaks and collapses repeated spaces',()=>expect(wrapLines('one   two\nthree',80,3,measure)).toEqual(['one two','three']));
  it('marks truncated text with an ellipsis',()=>expect(wrapLines('abcdefghij',40,2,measure)).toEqual(['abcd','efg…']));
  it('keeps surrogate pairs together',()=>expect(wrapLines('🙂🙂🙂🙂🙂',30,2,measure)).toEqual(['🙂🙂🙂','🙂🙂']));
  it('handles empty captions',()=>expect(wrapLines('',40,2,measure)).toEqual([]));
});

it('stops an encoded stream above 64 MiB while permitting the boundary',()=>{
  expect(()=>checkOutputBudget(64*1024*1024)).not.toThrow();
  expect(()=>checkOutputBudget(64*1024*1024+1)).toThrow();
});
