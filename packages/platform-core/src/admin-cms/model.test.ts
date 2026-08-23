import { describe, expect, it } from "vitest";
import { canTransitionCmsState, parseMapPrepDestination, parseMediaMetadata, readMapPrepDestination, parseStructuredCmsDraft } from "./model";

const draft = { key:"homepage",title:"Math learning",description:"Teacher-led practice",seoTitle:"MathNexa",seoDescription:"Math practice",socialTitle:"MathNexa",socialDescription:"Teacher-led math",blocks:[{type:"hero",heading:"Practice with purpose",body:"Choose a lesson."}] };

describe("structured CMS",()=>{
  it("accepts allowlisted data and state transitions",()=>{
    expect(parseStructuredCmsDraft(draft)?.blocks).toHaveLength(1);
    expect(canTransitionCmsState("draft","ready_for_review")).toBe(true);
    expect(canTransitionCmsState("draft","published")).toBe(false);
  });
  it("rejects executable HTML and unsafe destinations",()=>{
    expect(parseStructuredCmsDraft({...draft,blocks:[{type:"section",body:"<script>alert(1)</script>"}]})).toBeNull();
    expect(parseStructuredCmsDraft({...draft,key:"map-prep",blocks:[{type:"external-link",label:"MAP Prep",href:"javascript:alert(1)"}]})).toBeNull();
  });
  it("requires accessible text for visual media",()=>{
    expect(parseMediaMetadata({kind:"image",altText:"",caption:"",attribution:"",license:"owned"})).toBeNull();
    expect(parseMediaMetadata({kind:"audio",altText:"",caption:"Directions",attribution:"MathNexa",license:"owned"})?.kind).toBe("audio");
  });
  it("builds and revalidates an explicit MAP Prep host policy",()=>{
    const destination=parseMapPrepDestination({label:"MAP Prep",publicDescription:"Reviewed practice destination.",destinationUrl:"https://learn.showmemath.example.com/path",adminDestinationUrl:"https://admin.showmemath.example.com",enabled:true,openMode:"new_tab"},"2026-08-04T12:00:00Z");
    expect(destination?.openMode).toBe("same_tab");
    expect(destination?.allowedHosts).toEqual(["learn.showmemath.example.com","admin.showmemath.example.com"]);
    expect(readMapPrepDestination(destination)).toEqual(destination);
    expect(parseMapPrepDestination({label:"Unsafe",destinationUrl:"https://127.0.0.1/admin",enabled:true,openMode:"same_tab"},"2026-08-04T12:00:00Z")).toBeNull();
    expect(parseMapPrepDestination({label:"Unsafe",destinationUrl:"data:text/html,bad",enabled:true,openMode:"same_tab"},"2026-08-04T12:00:00Z")).toBeNull();
    const disabled=parseMapPrepDestination({label:"Disabled",destinationUrl:"https://learn.showmemath.example.com/path",enabled:false,openMode:"same_tab"},"2026-08-04T12:00:00Z");
    expect(disabled?.enabled).toBe(false);
    expect(readMapPrepDestination(disabled)?.enabled).toBe(false);
  });
});
