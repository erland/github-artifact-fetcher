/** Experimental MCP App widget for transferring a staged GitHub file into ChatGPT Library.
 * No binary bytes are ever sent through the MCP tool result. */
export const LIBRARY_UPLOAD_WIDGET_URI='ui://github-artifact-fetcher/library-upload.html';

export const libraryUploadWidgetHtml = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px system-ui,sans-serif;padding:14px;color:CanvasText;background:Canvas}button{border:1px solid ButtonBorder;background:ButtonFace;color:ButtonText;border-radius:7px;padding:9px 12px;cursor:pointer}button:disabled{opacity:.5}p{overflow-wrap:anywhere}a{color:LinkText}</style>
</head><body>
<h3>Spara GitHub-fil i ChatGPT-biblioteket (experiment)</h3>
<p id="details">Filen hämtas separat från MCP-konversationen. Tryck för att prova.</p>
<button id="save" type="button">Spara i biblioteket</button>
<p id="status" role="status" aria-live="polite"></p>
<p id="fallback"></p>
<script>
(function(){
  const host=window.openai;
  const output=host&&host.toolOutput;
  const item=output&&typeof output==='object'?(output.structuredContent||output):null;
  const button=document.getElementById('save'),status=document.getElementById('status');
  const fallback=document.getElementById('fallback');
  const valid=item&&typeof item.downloadUrl==='string'&&typeof item.filename==='string'&&
    typeof item.mimeType==='string'&&Number.isSafeInteger(item.sizeBytes)&&item.sizeBytes>0&&item.sizeBytes<=20*1024*1024;
  if(item&&typeof item.githubUrl==='string'){
    const a=document.createElement('a');a.href=item.githubUrl;a.textContent='Ladda ned på GitHub i stället';a.target='_blank';a.rel='noopener noreferrer';fallback.append(a);
  }
  if(valid) document.getElementById('details').textContent=item.filename+' ('+item.sizeBytes+' byte). Uppladdning kräver ditt klick.';
  if(!valid||typeof host?.uploadFile!=='function'){
    button.disabled=true;status.textContent='Automatisk uppladdning stöds inte här. Använd GitHub-länken i stället.';
    return;
  }
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
      status.textContent='Uppladdning rapporterad av ChatGPT. Fil-ID: '+result.fileId+'. Kontrollera att filen syns i biblioteket.';
    }catch(error){status.textContent='Fel vid '+phase+': '+String(error&&error.message||error)+'. Kontrollera nätverk/CORS/CSP eller använd GitHub-länken.';}
    finally{button.disabled=false;}
  });
})();
</script></body></html>`;
