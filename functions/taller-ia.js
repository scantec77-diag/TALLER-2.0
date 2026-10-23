'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const secret=defineSecret('OPENAI_API_KEY');
const db=getFirestore();
const clean=(v,n)=>String(v||'').trim().slice(0,n);
exports.tallerIA=onCall({region:'us-central1',secrets:[secret],timeoutSeconds:90,maxInstances:5,enforceAppCheck:true},async request=>{
 const uid=request.auth?.uid;
 if(!uid||request.auth.token.email_verified!==true)throw new HttpsError('unauthenticated','Sesión verificada requerida.');
 const question=clean(request.data?.message,2500);
 if(question.length<3)throw new HttpsError('invalid-argument','Escribí tu pregunta.');
 const day=new Date().toISOString().slice(0,10);
 await db.runTransaction(async tx=>{
  const ref=db.doc('aiRateLimits/'+uid+'_'+day),prev=await tx.get(ref);
  if((prev.data()?.count||0)>=20)throw new HttpsError('resource-exhausted','Límite diario de consultas.');
  tx.set(ref,{uid,day,count:FieldValue.increment(1)},{merge:true});
 });
 // Indexación manual de documentos con ACL explícita; nunca usar un token Drive compartido.
 const terms=[...new Set((question.toLowerCase().match(/[a-záéíóúüñ0-9]{4,}/g)||[]))].slice(0,30);
 let sources=[];
 if(terms.length){
  const snap=await db.collection('manualChunks').where('authorizedUids','array-contains',uid).where('published','==',true).limit(200).get();
  sources=snap.docs.map(d=>{
   const v=d.data(),content=clean(v.content,1800),lower=content.toLowerCase();
   return {title:clean(v.title,150),page:Number(v.page)||null,content,score:terms.filter(t=>lower.includes(t)).length};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4);
 }
 const docs=sources.map((s,i)=>'MANUAL '+(i+1)+' '+s.title+' página '+(s.page||'no indicada')+'\n'+s.content).join('\n\n');
 const instructions='Sos Taller IA, asistente técnico de máquinas y equipos en español argentino. Diferenciá datos documentales de conocimiento técnico general. Citá páginas sólo si están en el contexto. Nunca inventes referencias, valores o códigos de fallas. Preguntá por modelo y número de serie si es importante. Indicá riesgos de energía eléctrica, movimiento e hidráulica; requerí aislamiento y bloqueo antes de intervenir. No sugerir eludir protecciones. Documentos autorizados:\n'+(docs||'No se recuperaron documentos. Responder solamente conocimiento general.');
 const history=Array.isArray(request.data?.history)?request.data.history.slice(-8).filter(x=>['user','assistant'].includes(x?.role)).map(x=>({role:x.role,content:clean(x.content,1000)})):[];
 let reply;
 try{
  reply=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+secret.value(),'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',temperature:0.2,max_tokens:900,messages:[{role:'system',content:instructions},...history,{role:'user',content:question}]})});
 }catch(e){throw new HttpsError('unavailable','Servicio de IA no disponible.')}
 if(!reply.ok)throw new HttpsError('unavailable','Proveedor IA no disponible.');
 const data=await reply.json();
 return {answer:clean(data.choices?.[0]?.message?.content||'Sin respuesta.',7000),sources:sources.map(s=>({title:s.title,page:s.page}))};
});
