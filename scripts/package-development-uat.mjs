import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

/**
 * Deterministic, intentionally DEVELOPMENT-ONLY Obsidian Vault UAT ZIP.
 *
 * Never a GitHub Release, auto-update feed, HakiSend Admin upload, or a
 * substitute for source parity, mobile tests or explicit owner approval.
 * No token, data.json, environment config or user Vault content is included.
 * ZIP STORE method avoids external dependency and non-repeatable mtimes.
 */
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'dist','hakisend-publisher-development-uat.zip');
const sha256=x=>createHash('sha256').update(x).digest('hex');
const fileNames=['manifest.json','main.js','styles.css'];
const files=fileNames.map(name=>{
 const bytes=readFileSync(resolve(root,name));
 if(bytes.length===0)throw Error('Empty package member: '+name);
 return {name,data:bytes};
});
const manifest=JSON.parse(files[0].data.toString('utf8'));
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
if(manifest.id!=='hakisend-publisher' || manifest.isDesktopOnly!==false ||
   !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
   manifest.version!==pkg.version || !manifest.minAppVersion)
 throw Error('Obsidian id / compatibility / package version mismatch.');
if(!existsSync(resolve(root,'src','main.ts')))
 throw Error('Editable TypeScript source absent.');
const checksums=fileNames.map((name,i)=>sha256(files[i].data)+'  '+name).join('\n')+'\n';
files.push({name:'checksums.sha256',data:Buffer.from(checksums)});
files.push({name:'DEV-UAT-NOT-A-RELEASE.txt',data:Buffer.from(
 'HakiSend Publisher development UAT build\n'+
 'Version: '+manifest.version+'\n'+
 'Status: NOT RELEASE-READY. Requires v0.1.9 source parity, '+ 
 'mobile and desktop UAT, owner sign-off and verified HakiSend Sites upgrade.\n'+
 'Only install in a disposable Obsidian test Vault. Do not distribute.\n'
)});

const crc32=buffer=>{
 let c=0xffffffff;
 for(const v of buffer) {
   c^=v;
   for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);
 }
 return (c^0xffffffff)>>>0;
};
const local=[];
const central=[];
let offset=0;
for(const {name,data} of files){
 const fn=Buffer.from(name,'utf8');
 if(fn.length>65535||data.length>0xffffffff)throw Error('Oversized ZIP member.');
 const crc=crc32(data);
 const h=Buffer.alloc(30);
 h.writeUInt32LE(0x04034b50,0);
 h.writeUInt16LE(20,4);
 h.writeUInt16LE(0,6);
 h.writeUInt16LE(0,8);
 h.writeUInt16LE(0,10);
 h.writeUInt16LE(33,12); // 1980-01-01; all builds byte reproducible
 h.writeUInt32LE(crc,14);
 h.writeUInt32LE(data.length,18);
 h.writeUInt32LE(data.length,22);
 h.writeUInt16LE(fn.length,26);
 h.writeUInt16LE(0,28);
 local.push(h,fn,data);

 const ch=Buffer.alloc(46);
 ch.writeUInt32LE(0x02014b50,0);
 ch.writeUInt16LE(20,4);
 ch.writeUInt16LE(20,6);
 ch.writeUInt16LE(0,8);
 ch.writeUInt16LE(0,10);
 ch.writeUInt16LE(0,12);
 ch.writeUInt16LE(33,14);
 ch.writeUInt32LE(crc,16);
 ch.writeUInt32LE(data.length,20);
 ch.writeUInt32LE(data.length,24);
 ch.writeUInt16LE(fn.length,28);
 ch.writeUInt16LE(0,30);
 ch.writeUInt16LE(0,32);
 ch.writeUInt16LE(0,34);
 ch.writeUInt16LE(0,36);
 ch.writeUInt32LE(0,38);
 ch.writeUInt32LE(offset,42);
 central.push(ch,fn);
 offset+=h.length+fn.length+data.length;
}
const center=Buffer.concat(central);
if(offset>0xffffffff||center.length>0xffffffff)throw Error('ZIP64 unavailable.');
const end=Buffer.alloc(22);
end.writeUInt32LE(0x06054b50,0);
end.writeUInt16LE(0,4);
end.writeUInt16LE(0,6);
end.writeUInt16LE(files.length,8);
end.writeUInt16LE(files.length,10);
end.writeUInt32LE(center.length,12);
end.writeUInt32LE(offset,16);
end.writeUInt16LE(0,20);
const zip=Buffer.concat([...local,center,end]);
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,zip);
console.log('DEVELOPMENT_UAT_ONLY=YES');
console.log('OFFICIAL_RELEASE=NO');
console.log('OBSIDIAN_ID='+manifest.id);
console.log('OBSIDIAN_VERSION='+manifest.version);
console.log('ZIP_SHA256='+sha256(zip));
console.log('ZIP_ENTRIES='+files.map(f=>f.name).join(','));
console.log('PATH='+out);
