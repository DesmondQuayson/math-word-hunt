import { describe,expect,it } from "vitest";
import { inspectZipCentralDirectory } from "./zip-preflight.js";
function central(name:string,compressed=12,expanded=12,flags=0){const encoded=new TextEncoder().encode(name);const bytes=new Uint8Array(46+encoded.length+22);const view=new DataView(bytes.buffer);view.setUint32(0,0x02014b50,true);view.setUint16(4,20,true);view.setUint16(6,20,true);view.setUint16(8,flags,true);view.setUint16(10,8,true);view.setUint32(20,compressed,true);view.setUint32(24,expanded,true);view.setUint16(28,encoded.length,true);bytes.set(encoded,46);const end=46+encoded.length;view.setUint32(end,0x06054b50,true);view.setUint16(end+8,1,true);view.setUint16(end+10,1,true);view.setUint32(end+12,end,true);view.setUint32(end+16,0,true);return bytes;}
describe("Phase 8E ZIP preflight",()=>{
  it("accepts a bounded central directory",()=>expect(inspectZipCentralDirectory(central("game/index.html")).decision).toBe("accepted"));
  it("blocks traversal and encrypted entries",()=>{expect(inspectZipCentralDirectory(central("../escape.js")).findings).toContain("unsafe-entry-path");expect(inspectZipCentralDirectory(central("game/a.js",12,12,1)).findings).toContain("encrypted-entry");});
  it("blocks expansion and ratio bombs before decompression",()=>{expect(inspectZipCentralDirectory(central("game/a.js",10,20*1024*1024)).findings).toContain("compression-ratio-limit");expect(inspectZipCentralDirectory(central("game/a.js",10,21*1024*1024)).findings).toContain("expanded-size-limit");});
});
