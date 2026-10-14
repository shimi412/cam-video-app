// Isolated parser: stdin contains the verified local PDF, stdout only metadata.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const parts=[]; let size=0;
for await (const part of process.stdin) { size+=part.length;if(size>18*1024*1024)process.exit(2);parts.push(part); }
const task=getDocument({data:new Uint8Array(Buffer.concat(parts)),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0});
try {
  const pdf=await task.promise;
  if(pdf.numPages>40)throw new Error("Too many pages");
  let textBytes=0;
  for(let page=1;page<=pdf.numPages;page++){
    const content=await(await pdf.getPage(page)).getTextContent();
    textBytes+=Buffer.byteLength(content.items.map(item=>item.str??"").join(" "));
    if(textBytes>500000)throw new Error("Too much text");
  }
  process.stdout.write(JSON.stringify({pages:pdf.numPages,textBytes}));
}catch{process.exitCode=2;}finally{await task.destroy();}
