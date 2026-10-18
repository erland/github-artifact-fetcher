/** Experimental MCP App widget for transferring a staged GitHub file into ChatGPT Library.
 * No binary bytes are ever sent through the MCP tool result. */
export const LIBRARY_UPLOAD_WIDGET_URI='ui://github-artifact-fetcher/library-upload.html';

export const libraryUploadWidgetHtml = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px system-ui,sans-serif;padding:14px;color:CanvasText;background:Canvas}button{border:1px solid ButtonBorder;background:ButtonFace;color:ButtonText;border-radius:7px;padding:9px 12px;cursor:pointer}button:disabled{opacity:.5}p{overflow-wrap:anywhere}a{color:LinkText}</style>
</head><body>
<h3>Spara GitHub-fil i ChatGPT-biblioteket (experiment)</h3>
<p id="details">Filen hämtas separat från MCP-konversationen. Tryck för att prova.</p>
<button id="save" type="button">Spara i biblioteket</button> <button id="verify" type="button" disabled>Kontrollera biblioteket</button> <button id="handoff" type="button" disabled>Testa i konversationen</button>
<p id="status" role="status" aria-live="polite"></p>
<p id="fallback"></p>
<script>
(function(){
  const host=window.openai;
  const output=host&&host.toolOutput;
  const item=output&&typeof output==='object'?(output.structuredContent||output):null;
  const button=document.getElementById('save'),verifyButton=document.getElementById('verify'),handoffButton=document.getElementById('handoff'),status=document.getElementById('status');
  let uploadedId=null;
  async function sha256Hex(blob){
    if(!globalThis.crypto?.subtle)throw Error('SHA-256 stöds inte i denna klient');
    const bytes=await blob.arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function verifyReadback(downloadUrl){
    const address=new URL(downloadUrl);
    if(address.protocol!=='https:')throw Error('Återläsning kräver HTTPS');
    const result=await fetch(address.toString(),{credentials:'omit',cache:'no-store'});
    if(!result.ok)throw Error('Återläsning gav HTTP '+result.status);
    const bytes=await result.blob();
    if(bytes.size!==item.sizeBytes)throw Error('Återläst fil har fel storlek: '+bytes.size);
    const hash=await sha256Hex(bytes);
    if(hash.toLowerCase()!==item.sha256.toLowerCase())throw Error('SHA-256 skiljer sig från GitHub-originalet');
    return true;
  }

  const fallback=document.getElementById('fallback');
  const valid=item&&typeof item.downloadUrl==='string'&&typeof item.filename==='string'&&
    typeof item.mimeType==='string'&&/^[a-fA-F0-9]{64}$/.test(item.sha256)&&Number.isSafeInteger(item.sizeBytes)&&item.sizeBytes>0&&item.sizeBytes<=20*1024*1024;
  if(item&&typeof item.githubUrl==='string'){
    const a=document.createElement('a');a.href=item.githubUrl;a.textContent='Ladda ned på GitHub i stället';a.target='_blank';a.rel='noopener noreferrer';fallback.append(a);
  }
  if(valid) document.getElementById('details').textContent=item.filename+' ('+item.sizeBytes+' byte). Uppladdning kräver ditt klick.';
  if(!valid||typeof host?.uploadFile!=='function'){
    button.disabled=true;status.textContent='Automatisk uppladdning stöds inte här. Använd GitHub-länken i stället.';
    return;
  }
  verifyButton.addEventListener('click',async()=>{
    if(!uploadedId||typeof host?.selectFiles!=='function')return;
    try{
      const chosen=await host.selectFiles();
      if(!Array.isArray(chosen)||chosen.length===0){
        status.textContent='Ingen fil valdes i biblioteket. Bibliotekslagring är inte verifierad.';return;
      }
      const match=chosen.some(x=>x&&((x.fileId===uploadedId)||(x.fileName===item.filename)));
      status.textContent=match?'Filen hittades via biblioteksväljaren: '+item.filename+'.':'Valda biblioteksfiler matchade inte '+item.filename+'.';
    }catch(e){status.textContent='Bibliotekskontroll misslyckades: '+String(e&&e.message||e);}
  });
  handoffButton.addEventListener('click',async()=>{
    if(!uploadedId||typeof host?.sendFollowUpMessage!=='function')return;
    handoffButton.disabled=true;
    try{
      // Only a prompt/reference is sent; it is not an attachment and does not
      // transfer file bytes. The follow-up determines whether the model can use it.
      await host.sendFollowUpMessage({prompt:'Experiment: Kan du öppna och läsa den PDF som MCP App laddade upp med fil-ID '+uploadedId+' (filnamn '+item.filename+') via dina vanliga filverktyg? Kontrollera faktisk åtkomst, säg tydligt om det inte fungerar. Ingen fil är bifogad automatiskt.'});
      status.textContent='Testfråga skickad till konversationen. Detta bifogar inte filen; ChatGPT behöver kontrollera åtkomsten.';
    }catch(error){
      status.textContent='Det gick inte att skicka testfrågan: '+String(error&&error.message||error);
      handoffButton.disabled=false;
    }
  });
  button.addEventListener('click',async()=>{
    button.disabled=true;status.textContent='Hämtar filen…';
    let phase='nedladdning';
    try{
      const u=new URL(item.downloadUrl);
      if(u.protocol!=='https:')throw Error('Otrygg nedladdningsadress');
      if(item.expiresAt&&Date.now()>=Date.parse(item.expiresAt))throw Error('Länken har gått ut. Förbered filen igen.');
      const response=await fetch(u.toString(),{credentials:'omit',redirect:'error',cache:'no-store'});
      if(!response.ok)throw Error('Nedladdning misslyckades ('+response.status+')');
      phase='mottagning av fil';
      const blob=await response.blob();
      if(blob.size!==item.sizeBytes)throw Error('Filstorleken stämmer inte');
      phase='uppladdning till biblioteket';
      const file=new File([blob],item.filename,{type:item.mimeType});
      status.textContent='Sparar filen i ChatGPT-biblioteket…';
      const result=await host.uploadFile(file,{library:true});
      if(!result||typeof result.fileId!=='string')throw Error('Inget fil-ID returnerades');
      uploadedId=result.fileId;
      handoffButton.disabled=typeof host.sendFollowUpMessage!=='function';
      let diagnostic='ChatGPT returnerade fil-ID: '+uploadedId+'. ';
      if(typeof host.getFileDownloadUrl==='function'){
        try{
          const readback=await host.getFileDownloadUrl({fileId:uploadedId});
          if(readback&&typeof readback.downloadUrl==='string'){
            diagnostic+='Återläsningsadress skapad. ';
            try{
              const checked=await verifyReadback(readback.downloadUrl);
              if(checked)diagnostic+='Integritet verifierad: storlek och SHA-256 stämmer. ';
            }catch(e){diagnostic+='Filens innehåll kunde inte verifieras: '+String(e&&e.message||e)+'. ';}
            diagnostic+='Bibliotekslagring är fortfarande inte verifierad. ';
          }else diagnostic+='Återläsning gav ingen URL. ';
        }catch(e){diagnostic+='Återläsning misslyckades: '+String(e&&e.message||e)+'. ';}
      }else diagnostic+='Återläsningsfunktionen saknas. ';
      diagnostic+=typeof host.sendFollowUpMessage==='function'?' Du kan också prova Testa i konversationen (referens, ingen bilaga). ':' Funktionen för konversationstest saknas. ';
      if(typeof host.selectFiles==='function'){
        verifyButton.disabled=false;
        diagnostic+='Välj Kontrollera biblioteket och välj filen om den finns.';
      }else diagnostic+='Biblioteksväljaren stöds inte i den här klienten.';
      status.textContent=diagnostic;
    }catch(error){status.textContent='Fel vid '+phase+': '+String(error&&error.message||error)+'. Kontrollera nätverk/CORS/CSP eller använd GitHub-länken.';}
    finally{button.disabled=false;}
  });
})();
</script></body></html>`;
