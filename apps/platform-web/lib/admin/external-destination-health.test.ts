import { describe,expect,it } from "vitest";

import { checkAdminExternalDestination,isPublicInternetAddress } from "./external-destination-health";

describe("Phase 10 external destination health guard",()=>{
  it("rejects loopback, private, link-local, carrier, and documentation networks",()=>{
    for(const address of ["127.0.0.1","10.0.0.2","172.16.1.1","192.168.1.1","169.254.1.1","100.64.0.1","::1","fc00::1","fe80::1"]){
      expect(isPublicInternetAddress(address),address).toBe(false);
    }
  });
  it("accepts routable public addresses",()=>{
    expect(isPublicInternetAddress("8.8.8.8")).toBe(true);
    expect(isPublicInternetAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("fails closed before DNS for unsafe, encoded, and protocol-relative destinations",async()=>{
    for(const value of ["javascript:alert(1)","//example.com/path","https://example.com/%2f%2fevil.example","https://example.com@evil.example/path","http://example.com/path"]){
      await expect(checkAdminExternalDestination(value,"example.com")).resolves.toMatchObject({state:"unsafe",statusCode:null});
    }
  });
});
