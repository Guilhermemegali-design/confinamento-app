import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),XLSX=require('xlsx');
const {chromium}=await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[],writes=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('https://*.supabase.co/**',async route=>{
 const req=route.request();if(req.method()!=='GET')writes.push(req.method());
 const rows=req.url().includes('/trato_dietas')?[{id:'p',cliente_id:'previa-local-trato',tipo_receita:'pre_mistura',nome:'Núcleo mineral',ingredientes:[{name:'Fuba de Milho',percent:63},{name:'Nucleo Intense U',percent:34},{name:'Sal Branco',percent:3}]}]:[];
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows)});
});
try{
 await page.goto('http://localhost:4338/previa-trato');
 const section=page.getByRole('region',{name:'Consumo com pré-misturas abertas'});await section.waitFor();
 await section.getByRole('cell',{name:'Sal Branco',exact:true}).waitFor();
 const downloadCSV=page.waitForEvent('download');await section.getByRole('button',{name:'Exportar consumo aberto CSV'}).click();const csv=await downloadCSV;await csv.saveAs('/tmp/premistura-browser.csv');
 const downloadExcel=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar Excel',exact:true}).click();const excel=await downloadExcel;await excel.saveAs('/tmp/premistura-browser.xlsx');
 const book=XLSX.readFile('/tmp/premistura-browser.xlsx');assert.ok(book.SheetNames.includes('Premisturas abertas'));
 const rows=XLSX.utils.sheet_to_json(book.Sheets['Premisturas abertas'],{header:1});assert.ok(rows.some(r=>r[0]==='Sal Branco'));
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);await page.screenshot({path:'/tmp/premistura-browser-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await section.getByRole('cell',{name:'Sal Branco',exact:true}).waitFor();await section.screenshot({path:'/tmp/premistura-browser-mobile.png'});
 console.log(JSON.stringify({pass:true,csv:true,excelSheets:book.SheetNames,desktop:true,mobile:true,remoteWrites:0}));
}finally{await browser.close();}
