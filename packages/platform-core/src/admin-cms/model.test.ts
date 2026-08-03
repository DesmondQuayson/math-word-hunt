import { describe, expect, it } from "vitest";
import { canTransitionCmsState, parseMediaMetadata, parseStructuredCmsDraft } from "./model";

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
});
