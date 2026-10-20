import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../public/admin-machines.js', import.meta.url), 'utf8');
const wait = () => new Promise(resolve => setTimeout(resolve, 0));

async function scenario({existingSession=401, tokenStatus=401, signedIn=true, inClient=false}){
  const nodeMap = new Map(), events = new Map(), calls = {login:[],logout:0,liffInit:0,assigned:[],api:[]};
  const createNode = () => {
    const e = {textContent:'',value:'',checked:true,disabled:false,elements:[],className:'',
      classList:{add(){},remove(){},toggle(){}},
      addEventListener(type, handler){this.listeners ??= {};this.listeners[type]=handler;},
      appendChild(){},replaceChildren(){},setAttribute(){},scrollIntoView(){},reset(){},showModal(){},close(){}};
    return e;
  };
  const doc={getElementById(id){if(!nodeMap.has(id))nodeMap.set(id,createNode());return nodeMap.get(id);},
    createElement(){return createNode();},createElementNS(){return createNode();},
    body:createNode()};
  const liff={
    async init(){calls.liffInit++;},
    isLoggedIn(){return signedIn;},isInClient(){return inClient;},
    getIDToken(){return 'example-token';},
    logout(){calls.logout++;signedIn=false;},
    login(args){calls.login.push(args);}
  };
  const config={ready:true,liffId:'2012120948-rYfATUiF'};
  const fetch=async (url, options={})=>{
    calls.api.push(`${options.method||'GET'} ${url}`);
    if(url==='/api/config')return result(200,config);
    if(url==='/api/admin/machines')return result(existingSession,{role:'owner',items:[]});
    if(url==='/api/auth/line')return result(tokenStatus,tokenStatus===200?{registrationRequired:false}:{error:'LINE_TOKEN_REJECTED'});
    throw new Error('Unexpected API URL '+url);
  };
  function result(status, body){return {ok:status<400,status,async json(){return body;}};}
  const location = {origin:'https://boxing-members.organization-23c.workers.dev',
    href:'https://boxing-members.organization-23c.workers.dev/admin/machines?utm_source=chatgpt.com',
    assign(url){calls.assigned.push(url)}};
  const window={liff};
  const context={window,document:doc,location,navigator:{},HTMLInputElement:class {},
    fetch,console,URL,setTimeout,clearTimeout,confirm:()=>true};
  vm.runInNewContext(script,context,{filename:'admin-machines.js'});
  await wait();await wait();await wait();
  const click=nodeMap.get('sign-in').listeners?.click;
  return {calls,nodeMap,click};
}

// Regression: stale LINE token while LIFF still reports signed in must force a fresh authorization.
{
 const {calls,nodeMap,click}=await scenario({existingSession:401,tokenStatus:401,signedIn:true});
 assert.equal(nodeMap.get('access-title').textContent,'ต้องยืนยัน LINE ใหม่');
 await click();
 assert.equal(calls.logout,1);
 assert.equal(calls.login.length,1);
 assert.equal(calls.login[0].redirectUri,'https://boxing-members.organization-23c.workers.dev/admin/machines');
}

// A valid signed backend session must work even if an old LINE token would be rejected.
{
 const {calls,nodeMap}=await scenario({existingSession:200,tokenStatus:401,signedIn:true});
 assert.equal(calls.liffInit,0);
 assert.equal(nodeMap.get('machine-app').classList!==undefined,true);
 assert.equal(calls.api.some(x=>x.includes('/api/auth/line')),false);
}

// Users without Admin privileges cannot use a login loop to bypass the allowlist.
{
 const {calls,nodeMap}=await scenario({existingSession:403,signedIn:true});
 assert.equal(nodeMap.get('access-title').textContent,'ไม่มีสิทธิ์ Admin');
 assert.equal(calls.login.length,0);
}

// The LIFF browser must reopen via official LIFF URL, not invoke unsupported liff.login().
{
 const {calls,click}=await scenario({existingSession:401,tokenStatus:401,signedIn:true,inClient:true});
 await click();
 assert.equal(calls.login.length,0);
 assert.equal(calls.assigned[0],'https://liff.line.me/2012120948-rYfATUiF/admin/machines');
}
console.log('PASS: 4 auth recovery tests');
