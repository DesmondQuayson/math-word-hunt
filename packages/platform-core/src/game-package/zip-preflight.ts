export type ZipEntryEvidence = Readonly<{ path: string; compressedSize: number; expandedSize: number; compressionMethod: 0 | 8 }>;
export type ZipPreflight = Readonly<{ decision: "accepted" | "quarantined"; entries: readonly ZipEntryEvidence[]; expandedSize: number; findings: readonly string[] }>;

const MAX_ARCHIVE = 25 * 1024 * 1024;
const MAX_EXPANDED = 75 * 1024 * 1024;
const MAX_ENTRY = 20 * 1024 * 1024;

export function inspectZipCentralDirectory(bytes: Uint8Array): ZipPreflight {
  const findings: string[] = []; const entries: ZipEntryEvidence[] = [];
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_ARCHIVE) return Object.freeze({ decision:"quarantined",entries:Object.freeze([]),expandedSize:0,findings:Object.freeze(["invalid-compressed-size"]) });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) if (view.getUint32(offset,true)===0x06054b50) { eocd=offset; break; }
  if (eocd<0) return Object.freeze({ decision:"quarantined",entries:Object.freeze([]),expandedSize:0,findings:Object.freeze(["missing-central-directory"]) });
  const disk=view.getUint16(eocd+4,true),centralDisk=view.getUint16(eocd+6,true),diskEntries=view.getUint16(eocd+8,true),totalEntries=view.getUint16(eocd+10,true);
  const centralSize=view.getUint32(eocd+12,true),centralOffset=view.getUint32(eocd+16,true);
  if (disk!==0||centralDisk!==0||diskEntries!==totalEntries) findings.push("multi-disk-archive");
  if (totalEntries<1||totalEntries>256) findings.push("entry-count-limit");
  if (totalEntries===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff) findings.push("zip64-directory");
  if (centralOffset+centralSize>eocd) findings.push("invalid-central-directory-bounds");
  let offset=centralOffset; let expandedSize=0; const names=new Set<string>();
  for (let index=0;index<totalEntries && findings.length<20;index+=1) {
    if(offset+46>bytes.length||view.getUint32(offset,true)!==0x02014b50){findings.push("invalid-central-entry");break;}
    const madeBy=view.getUint16(offset+4,true),flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true);
    const compressed=view.getUint32(offset+20,true),expanded=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),external=view.getUint32(offset+38,true);
    const end=offset+46+nameLength+extraLength+commentLength;if(end>bytes.length){findings.push("invalid-central-entry-bounds");break;}
    let path="";try{path=new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(offset+46,offset+46+nameLength));}catch{findings.push("invalid-entry-name");}
    if(flags&1)findings.push("encrypted-entry");if(method!==0&&method!==8)findings.push("unsupported-compression");
    if(compressed===0xffffffff||expanded===0xffffffff)findings.push("zip64-entry");
    if(expanded>MAX_ENTRY||expandedSize+expanded>MAX_EXPANDED)findings.push("expanded-size-limit");
    if(compressed>0&&expanded>1024*1024&&expanded/compressed>100)findings.push("compression-ratio-limit");
    if(path.endsWith("/")){offset=end;continue;}
    if(!path||path.length>240||path.includes("\\")||path.startsWith("/")||/(^|\/)\.\.?(\/|$)|\0|^[a-z]:/i.test(path))findings.push("unsafe-entry-path");
    const folded=path.normalize("NFC").toLocaleLowerCase("en-US");if(names.has(folded))findings.push("duplicate-entry-path");names.add(folded);
    const host=madeBy>>>8,mode=external>>>16;if(host===3&&(mode&0o170000)===0o120000)findings.push("symbolic-link-entry");
    expandedSize+=expanded;entries.push(Object.freeze({path,compressedSize:compressed,expandedSize:expanded,compressionMethod:method as 0|8}));offset=end;
  }
  if(offset!==centralOffset+centralSize)findings.push("central-directory-size-mismatch");
  return Object.freeze({decision:findings.length?"quarantined":"accepted",entries:Object.freeze(entries),expandedSize,findings:Object.freeze([...new Set(findings)])});
}
