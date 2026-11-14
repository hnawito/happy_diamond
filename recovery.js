import { api } from './member-client.js';
const $=s=>document.querySelector(s),params=new URLSearchParams(location.hash.slice(1));
const token=params.get('token'),unsubscribe=params.get('unsubscribe');
if(token||unsubscribe){history.replaceState(null,'',location.pathname);$('#forgot-form').hidden=true;$(token?'#reset-form':'#unsubscribe-form').hidden=false;$('#recovery-heading').textContent=token?'Choose your password.':'Email preferences.';}
function action(selector,fn){$(selector).onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const result=await fn(e.target);$('#recovery-status').textContent=result.message;if(selector!=='#forgot-form')e.target.hidden=true;}catch(err){$('#recovery-status').textContent=err.message;}finally{b.disabled=false;}};}
action('#forgot-form',form=>api('/api/auth/forgot','POST',Object.fromEntries(new FormData(form))));
action('#reset-form',form=>{if(form.elements.password.value!==form.elements.confirm.value)throw new Error('Passwords do not match.');return api('/api/auth/reset','POST',{token,password:form.elements.password.value});});
action('#unsubscribe-form',()=>api('/api/auth/unsubscribe','POST',{token:unsubscribe}));
