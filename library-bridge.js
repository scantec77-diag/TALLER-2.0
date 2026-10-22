// Biblioteca privada Taller 2.0: enlace de transporte al servicio de Apps Script.
// No guarda contraseñas ni permisos de la cuenta propietaria de los manuales.
const endpoint='https://script.google.com/macros/s/AKfycbzPf-zrdvBwb6jxxTAmI6vdqQO8mkpJf1324NuIYFpBgwZS5kbHE1G2zdZDEihZPXUh/exec';
export async function libraryRequest(firebaseUser,action,args={}){
  if(!firebaseUser)throw Error('Ingresá a Taller 2.0 para acceder a los manuales.');
  const token=await firebaseUser.getIdToken();
  const id=()=>Array.from(crypto.getRandomValues(new Uint8Array(18)),x=>x.toString(16).padStart(2,'0')).join('');
  const channel=id(),requestId=id(),uid=firebaseUser.uid;
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');
    frame.name='lib_'+requestId;frame.hidden=true;frame.style.display='none';
    const form=document.createElement('form');
    form.action=endpoint;form.method='POST';form.target=frame.name;form.hidden=true;
    for(const [key,val] of Object.entries({...args,idToken:token,action,requestId,channel})){
      const field=document.createElement('input');field.type='hidden';field.name=key;field.value=String(val??'');form.append(field);
    }
    let finished=false;
    function finish(error,data){
      if(finished)return;finished=true;clearTimeout(timeout);
      window.removeEventListener('message',receive);form.remove();frame.remove();
      error?reject(error):resolve(data);
    }
    function receive(e){
      let host='';
      try{const u=new URL(e.origin);if(u.protocol!=='https:')return;host=u.hostname}catch(_){return}
      if(!['script.google.com','script.googleusercontent.com'].includes(host)&&!host.endsWith('.googleusercontent.com'))return;
      const d=e.data;
      if(!d||d.channel!==channel||d.requestId!==requestId)return;
      if(firebaseUser.uid!==uid)return finish(Error('La sesión cambió.'));
      if(!d.ok)return finish(Error(d.error||'El servidor rechazó la solicitud'));
      finish(null,d.payload);
    }
    const timeout=setTimeout(()=>finish(Error('El servicio de manuales no respondió; verificá la implementación de Apps Script.')),45000);
    window.addEventListener('message',receive);
    document.body.append(frame,form);try{form.submit()}catch(err){finish(err)}
  });
}
