import { CloudError, isNetworkError } from '../cloud/api.js';
/** One auth lifecycle; stable request IDs survive uncertain network responses. */
export class AdminService {
  constructor(session) { this.session=session; this.me=null; this.pending=null; this.chatPending=new Map(); }
  async request(op,args={},id=null) {
    const result=await this.session._authed(token=>this.session.api.rpc('admin_request',{op,args,request_id:id},token));
    return result;
  }
  async bootstrap() { const data=await this.request('bootstrap');this.me=data.me;return data; }
  async mutate(op,args) {
    const signature=JSON.stringify({op,args}),user=this.session.userId;
    if(this.pending && (this.pending.signature!==signature || this.pending.user!==user)) throw new CloudError('admin_pending', 'Предыдущее изменение ещё не подтверждено. Сначала повторите его.');
    const task=this.pending ||= {signature,user,id:crypto.randomUUID()};
    if(task.promise) return task.promise;
    task.promise=this.request(op,args,task.id).then(r=>{this.pending=null;return r;}).catch(e=>{if(!isNetworkError(e))this.pending=null;throw e;}).finally(()=>{task.promise=null;});
    return task.promise;
  }
  async chat(op,args={},writing=false) {
    const key=this.session.userId+':'+op+':'+JSON.stringify(args);
    const id=writing?(this.chatPending.get(key)||crypto.randomUUID()):null;
    if(writing)this.chatPending.set(key,id);
    try{const result=await this.session._authed(token=>this.session.api.rpc('chat_request',{op,args,request_id:id},token));this.chatPending.delete(key);return result;}
    catch(e){if(!isNetworkError(e))this.chatPending.delete(key);throw e;}
  }
}
