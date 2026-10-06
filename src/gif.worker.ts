import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { checkOutputBudget } from './media-utils';

const scope=self as unknown as DedicatedWorkerGlobalScope;
let gif:ReturnType<typeof GIFEncoder>|undefined;
scope.onmessage=({data})=>{
  try {
    if(data.type==='start') {gif=GIFEncoder();scope.postMessage({type:'ready'});}
    else if(data.type==='frame' && gif) {
      const rgba=new Uint8Array(data.buffer); const palette=quantize(rgba,256);
      gif.writeFrame(applyPalette(rgba,palette),data.width,data.height,{palette,delay:data.delayMs,repeat:0});
      checkOutputBudget(gif.bytesView().byteLength);
      scope.postMessage({type:'frame',index:data.index});
    } else if(data.type==='finish' && gif) {
      gif.finish();checkOutputBudget(gif.bytesView().byteLength);
      const bytes=gif.bytes();scope.postMessage({type:'done',buffer:bytes.buffer},[bytes.buffer]);gif=undefined;
    } else throw new Error('Invalid encoder state.');
  } catch(error) {scope.postMessage({type:'error',code:(error as {code?:string}).code,message:error instanceof Error?error.message:'GIF encoding failed.'});}
};
