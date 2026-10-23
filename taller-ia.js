// Taller IA: conversación privada en memoria del dispositivo. Sin claves API en el navegador.
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
const MAX_CONTEXT=8;
export function openTallerIA({app,view,user,home}){
  if(!user?.uid)return;
  const uid=user.uid;
  view.innerHTML=`<section class="tia"><div class="tia-head"><div><h2>🤖 Taller IA</h2><small>Asistente técnico · Consulta manuales autorizados y conocimientos generales</small></div><button class="back" id="tiaBack" type="button">← Volver</button></div><div class="tia-log" id="tiaLog" role="log" aria-live="polite" aria-label="Conversación privada"><div class="tia-bubble tia-answer">Hola. Contame qué equipo, modelo y síntoma estás revisando. Voy a distinguir la información de los manuales de las recomendaciones generales.</div></div><form id="tiaForm" class="tia-compose"><textarea id="tiaQuestion" rows="2" maxlength="2500" placeholder="Escribí tu consulta técnica..." aria-label="Consulta técnica" required></textarea><button class="settings" id="tiaSend" type="submit">Enviar ➤</button></form><p id="tiaStatus" class="tia-status" role="status">Las respuestas pueden contener errores. Verificá procedimientos críticos con documentación del fabricante.</p></section>`;
  const log=document.getElementById('tiaLog'),form=document.getElementById('tiaForm'),question=document.getElementById('tiaQuestion'),send=document.getElementById('tiaSend'),status=document.getElementById('tiaStatus');
  const history=[];
  let busy=false;
  const current=()=>form.isConnected&&user.uid===uid;
  document.getElementById('tiaBack').onclick=home;
  const add=(label,type)=>{const node=document.createElement('div');node.className='tia-bubble '+type;node.textContent=label;log.append(node);log.scrollTop=log.scrollHeight;return node};
  form.onsubmit=async event=>{
    event.preventDefault();
    const message=question.value.trim();
    if(!message||busy||!current())return;
    busy=true;send.disabled=true;question.disabled=true;
    add(message,'tia-user');question.value='';
    const pending=add('Consultando…','tia-answer');status.textContent='Buscando una respuesta técnica…';
    try{
      const fn=httpsCallable(getFunctions(app,'us-central1'),'tallerIA',{timeout:90000});
      const result=await fn({message,history:history.slice(-MAX_CONTEXT)});
      if(!current())return;
      const answer=String(result.data?.answer||'No recibí una respuesta.');
      pending.textContent=answer;
      const sources=Array.isArray(result.data?.sources)?result.data.sources:[];
      if(sources.length){const note=document.createElement('small');note.className='tia-sources';note.textContent='Manuales consultados: '+sources.map(x=>x.title+(x.page?' · pág. '+x.page:'')).join('; ');pending.append(document.createElement('hr'),note)}
      history.push({role:'user',content:message},{role:'assistant',content:answer});
      if(history.length>MAX_CONTEXT)history.splice(0,history.length-MAX_CONTEXT);
      status.textContent=sources.length?'Respuesta con referencias de manuales indexados.':'Respuesta de conocimiento general: no se encontraron referencias documentales habilitadas para esta consulta.';
    }catch(err){
      if(!current())return;
      pending.textContent=err.code==='functions/not-found'||err.code==='functions/unavailable'?'El motor de Taller IA todavía no está publicado. El chat está preparado, pero falta activar el servicio seguro.':err.code==='functions/resource-exhausted'?'Alcanzaste el límite de consultas de hoy.':err.code==='functions/unauthenticated'?'La sesión venció. Volvé a iniciar sesión.':'No se pudo obtener la respuesta. Probá nuevamente.';
      status.textContent='No se envió una respuesta.';
    }finally{if(current()){busy=false;send.disabled=false;question.disabled=false;question.focus()}}
  };
}
