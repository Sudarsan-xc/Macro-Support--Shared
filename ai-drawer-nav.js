/* Open the AI assistant in a drawer, preserving the current macro view. */
(() => {
 const drawer=document.getElementById('splitAiPanel');
 const overlay=document.getElementById('mdaiOverlay');
 const launch=document.getElementById('mdaiQuickLaunch');
 const closeButton=document.getElementById('mdai-close');
 if(!drawer||!overlay)return;
 let previousFocus=null;
 let aiLoadPromise=null;
 function loadAI(){
   if(!aiLoadPromise){
     aiLoadPromise=new Promise((resolve,reject)=>{
       const script=document.createElement('script');
       script.src='ai-embedded.js';
       script.async=true;
       script.onload=resolve;
       script.onerror=()=>reject(new Error('Could not load AI chat script.'));
       document.body.appendChild(script);
     }).catch(err=>{aiLoadPromise=null;const box=document.getElementById('mdai-error');if(box)box.textContent=err.message;});
   }
   return aiLoadPromise;
 }
 function open(){loadAI();previousFocus=document.activeElement;drawer.removeAttribute('inert');drawer.classList.add('open');overlay.classList.add('open');drawer.setAttribute('aria-hidden','false');document.body.classList.add('mdai-drawer-open');setTimeout(()=>document.getElementById('mdai-message')?.focus(),60);}
 function close(){document.dispatchEvent(new Event('macrodesk-ai-closed'));drawer.classList.remove('open');drawer.setAttribute('inert','');overlay.classList.remove('open');drawer.setAttribute('aria-hidden','true');document.body.classList.remove('mdai-drawer-open');previousFocus?.focus?.();}
 launch?.addEventListener('click',open);
 closeButton?.addEventListener('click',close);overlay.addEventListener('click',close);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawer.classList.contains('open')){e.preventDefault();close();}if(e.key==='Tab'&&drawer.classList.contains('open')){const items=[...drawer.querySelectorAll('button:not([disabled]),textarea:not([disabled])')].filter(x=>x.getClientRects().length);if(!items.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
})();
