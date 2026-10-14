import { expect,it } from "vitest";
import { inspectPdf } from "../src/lib/pdf-inspection";
function document(){
  const content="BT /F1 12 Tf 20 60 Td (CAM source) Tj ET";
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(x=>`${String(x).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return Buffer.from(pdf);
}
it("reads page count and text locally for the native PDF budget",async()=>{expect(await inspectPdf(document())).toEqual({pages:1,textBytes:10});},20000);
it("rejects invalid data before uploading anything",async()=>{await expect(inspectPdf(Buffer.from("not a PDF"))).rejects.toThrow("could not be read");},20000);
