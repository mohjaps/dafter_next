"use client";
import type {PaperWidth} from './thermal';
export const thermalCss=`
*{box-sizing:border-box}html,body{margin:0;padding:0;min-width:0;background:#fff;color:#000}
body{font-family:Tahoma,Arial,sans-serif;font-size:11px;line-height:1.5;direction:rtl}
.thermal-receipt{width:100%;padding:4mm;overflow-wrap:anywhere}
header,footer{text-align:center}h1{font-size:16px;margin:0 0 2mm;font-weight:700}h2{font-size:12px;margin:2mm 0 1mm}p{margin:1mm 0}header{padding-bottom:2mm;border-bottom:1px dashed #000}
.thermal-meta{padding:2mm 0}.thermal-meta p{display:flex;gap:2mm;justify-content:space-between;align-items:baseline}.thermal-meta strong{font-weight:400;text-align:left;max-width:70%}
table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:inherit}th,td{padding:1.5mm .4mm;vertical-align:top;text-align:center;border-bottom:1px dashed #999}th{border-top:1px dashed #000;border-bottom:1px dashed #000;font-size:10px}th:first-child,td:first-child{text-align:right;width:43%}th:nth-child(2){width:15%}th:nth-child(3),th:nth-child(4){width:21%}td small{display:block;font-size:9px}td strong{font-weight:400}tr{break-inside:avoid}
.thermal-totals{margin:2mm 0;padding:0}.thermal-totals>div{display:flex;justify-content:space-between;gap:2mm;margin:1mm 0}.thermal-totals dt,.thermal-totals dd{margin:0}.thermal-total{font-size:15px;font-weight:bold;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:2mm 0}
.thermal-notes{white-space:pre-wrap}footer{margin-top:3mm;padding-top:2mm;border-top:1px dashed #000}footer small{font-size:9px}
body[data-paper="58"]{font-size:10px}body[data-paper="58"] h1{font-size:14px}body[data-paper="58"] th{font-size:9px}body[data-paper="58"] .thermal-receipt{padding:5mm}body[data-paper="58"] .thermal-total{font-size:13px}
@media print{html,body{width:100%;height:auto}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
/** A separate print document isolates receipt paper rules from reports and the app layout. */
export async function printThermal(source:HTMLElement,width:PaperWidth):Promise<void>{
 const frame=document.createElement('iframe');frame.title='طباعة الفاتورة';frame.setAttribute('aria-hidden','true');
 Object.assign(frame.style,{position:'fixed',left:'-10000px',top:'0',width:`${width}mm`,height:'1px',border:'0'});
 document.body.appendChild(frame);
 const cleanup=()=>frame.remove();
 try{
  const doc=frame.contentDocument;const win=frame.contentWindow;if(!doc||!win)throw new Error('تعذر فتح نافذة الطباعة.');
  const root=doc.documentElement;root.lang='ar';root.dir='rtl';doc.title='فاتورة دفتر';
  doc.body.dataset.paper=String(width);
  const style=doc.createElement('style');style.textContent=thermalCss;doc.head.appendChild(style);
  const receipt=doc.importNode(source,true);receipt.removeAttribute('id');receipt.removeAttribute('hidden');receipt.removeAttribute('aria-hidden');doc.body.appendChild(receipt);
  // Wait for layout before calculating a valid custom page size; CSS does not accept "80mm auto".
  await new Promise<void>(resolve=>window.setTimeout(resolve,50));
  const mmHeight=Math.max(40,Math.ceil((receipt.getBoundingClientRect().height+4)*25.4/96));
  const page=doc.createElement('style');page.textContent=`@page{size:${width}mm ${mmHeight}mm;margin:0}`;doc.head.appendChild(page);
  win.addEventListener('afterprint',cleanup,{once:true});
  // Some printer drivers omit afterprint; release the temporary document later.
  window.setTimeout(cleanup,300000);
  win.focus();win.print();
 }catch(error){cleanup();throw error;}
}
