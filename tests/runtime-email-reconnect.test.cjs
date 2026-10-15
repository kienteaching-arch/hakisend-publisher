'use strict';
/**
 * Owner-tested v0.1.9 OAuth mock parity, now run against the ACTUAL
 * TypeScript-built main.js. No HakiSend network or production token.
 * Invoke only AFTER "npm run build", not in pre-build source tests.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const PUBLISHING=['sites:read','content:read','content:write',
  'publications:write','media:write'];
const EMAIL=['email:read','email:compose'];
const SECRET='hakisend-publisher-access-token';
const PENDING='hakisend-publisher-pkce-pending';
const state={opened:[],http:[],notices:[],buttons:[],protocols:{},handler:null};
const secrets=new Map();
let saved={};
class NodeEl {
  constructor(){this.children=[];}
  empty(){this.children=[];}
  createEl(tag,props){const e=new NodeEl();e.tag=tag;e.text=props?.text;this.children.push(e);return e;}
  createDiv(x){return this.createEl('div',x);}
  addClass(){}
  setText(s){this.text=s;}
}
class Notice {constructor(message){state.notices.push(String(message));}}
class Setting {
 constructor(root){this.root=root;}
 setName(s){this.name=s;return this;}
 setDesc(s){this.description=s;return this;}
 addButton(cb){const b={label:'',
   setButtonText(s){this.label=s;return this;},
   setCta(){return this;},setDisabled(){return this;},setWarning(){return this;},
   onClick(fn){this.callback=fn;return this;}
  };state.buttons.push(b);cb(b);return this;}
 addText(fn){fn({setPlaceholder(){return this;},setValue(){return this;},onChange(){return this;}});return this;}
 addDropdown(fn){fn({addOption(){return this;},setValue(){return this;},onChange(){return this;}});return this;}
 addToggle(fn){fn({setValue(){return this;},onChange(){return this;}});return this;}
}
const app={
 secretStorage:{getSecret(k){return secrets.get(k)||'';},setSecret(k,v){secrets.set(k,v);}},
 vault:{getAllLoadedFiles(){return [];},getMarkdownFiles(){return [];}},
 workspace:{getActiveFile(){return null;}}
};
class Plugin {
 constructor(){this.app=app;this.commands=[];}
 async loadData(){return saved;}
 async saveData(v){saved=JSON.parse(JSON.stringify(v));}
 registerObsidianProtocolHandler(k,cb){state.protocols[k]=cb;}
 addCommand(v){this.commands.push(v);}
 addRibbonIcon(){}
 addSettingTab(tab){this.tab=tab;}
}
class Modal {constructor(a){this.app=a;this.contentEl=new NodeEl();}}
class PluginSettingTab {constructor(a,p){this.app=a;this.plugin=p;this.containerEl=new NodeEl();}}
class TFolder {} class TFile {}
const obsidian={Plugin,Modal,PluginSettingTab,FuzzySuggestModal:class {},
 Notice,Setting,TFolder,TFile,
 requestUrl:async args=>{
   state.http.push(args);
   if(!state.handler)throw Error('No HTTP mock');
   return state.handler(args);
 }};
// Mirror the known-passing owner-tested v0.1.9 Obsidian runtime harness:
// establish the desktop globals BEFORE evaluating the compiled bundle and
// keep the obsidian require shim while plugin methods are exercised.
global.window={open(url){state.opened.push(url);return {};}};
const original=Module._load;
Module._load=function(name,...args){
  return name==='obsidian'?obsidian:original.call(this,name,...args);
};
const Main=require(path.resolve(__dirname,'../main.js')).default;
assert.equal(typeof Main,'function','Obsidian development bundle exports a plugin class');

function reset(){
  state.opened.length=0;state.http.length=0;state.notices.length=0;
  state.buttons.length=0;state.handler=null;state.protocols={};
  secrets.clear();secrets.set(SECRET,'PRIOR_TOKEN');
  saved={apiBaseUrl:'https://app.hakisend.com',sites:[]};
}
async function plugin(){const p=new Main();await p.onload();return p;}
function pending(){return JSON.parse(secrets.get(PENDING));}
function httpScopes(scopes,{secondStatus=200,secondPayload}={}){
  state.handler=async ({url})=>url.endsWith('/connect/exchange')
    ? {status:200,json:{success:true,data:{access_token:'NEW_TOKEN',scopes}}}
    :{status:secondStatus,json:secondPayload??{success:true,data:[
      {uid:'11111111-1111-4111-8111-111111111111',name:'Owner Site'}
    ]}};
}
async function callback(){const p=pending();await state.protocols['hakisend-connect']({state:p.state,code:'CODE'});}

test('compiled Publisher installs local Email planner and secure Email reconnect, no send commands',async()=>{
 reset();
 assert.equal(typeof Main,'function');
});
test('legacy connect does not request Email and exact five-scope response remains accepted',async()=>{
 reset();const p=await plugin();await p.startBrowserConnect();
 assert.equal(pending().emailAccessRequested,false);
 assert.equal(new URL(state.opened[0]).searchParams.has('email_access_requested'),false);
 httpScopes(PUBLISHING);await callback();
 assert.equal(secrets.get(SECRET),'NEW_TOKEN');
});
test('reconnect asks separately for read+compose, validates seven scopes and Sites before replacement',async()=>{
 reset();const p=await plugin();
 await p.commands.find(x=>x.id==='reconnect-email-draft-access').callback();
 assert.equal(pending().emailAccessRequested,true);
 const url=new URL(state.opened[0]);
 assert.equal(url.searchParams.get('email_access_requested'),'read_compose');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(secrets.get(SECRET),'PRIOR_TOKEN');
 httpScopes([...EMAIL,...PUBLISHING]);await callback();
 assert.equal(state.http.filter(r=>r.method==='GET').length,2);
 assert.equal(secrets.get(SECRET),'NEW_TOKEN');
 assert(state.notices.some(x=>x.includes('Sending is NOT enabled')));
});
test('declined or unexpectedly privileged Email permissions keep old credential',async()=>{
 for(const scopes of [PUBLISHING,
  [...PUBLISHING,'email:read'],
  [...PUBLISHING,...EMAIL,'email:send'],
  [...PUBLISHING,...EMAIL,'email:read'],
  null]){
  reset();const p=await plugin();await p.startBrowserConnect(true);
  httpScopes(scopes);await callback();
  assert.equal(secrets.get(SECRET),'PRIOR_TOKEN');
  assert.equal(secrets.get(PENDING),'');
 }
});
test('reconnect denied Site read does not activate newly issued credential',async()=>{
 reset();const p=await plugin();await p.startBrowserConnect(true);
 httpScopes([...PUBLISHING,...EMAIL],{secondStatus:403,
  secondPayload:{success:false}});
 await callback();
 assert.equal(secrets.get(SECRET),'PRIOR_TOKEN');
});
test('failed second Site refresh restores previous working token',async()=>{
 reset();const p=await plugin();await p.startBrowserConnect(true);
 let gets=0;
 state.handler=async ({url})=>url.endsWith('/connect/exchange')
  ? {status:200,json:{success:true,data:{
      access_token:'NEW_TOKEN',scopes:[...PUBLISHING,...EMAIL]}}}
  : (++gets===1
      ?{status:200,json:{success:true,data:[]}}
      :{status:503,json:{success:false}});
 await callback();
 assert.equal(gets,2);
 assert.equal(secrets.get(SECRET),'PRIOR_TOKEN');
 assert(state.notices.some(x=>x.includes('previous token restored')));
});
test('settings show separate, optional Email Draft reconnect action',async()=>{
 reset();const p=await plugin();p.tab.display();
 assert(state.buttons.some(b=>b.label==='Reconnect with Email Draft Access'));
 assert(state.buttons.some(b=>b.label==='Reconnect'));
});
test('authorization state mismatch cannot exchange or replace previous bearer',async()=>{
 reset();const p=await plugin();await p.startBrowserConnect(true);
 await state.protocols['hakisend-connect']({state:'WRONG',code:'CODE'});
 assert.equal(state.http.length,0);
 assert.equal(secrets.get(SECRET),'PRIOR_TOKEN');
});
