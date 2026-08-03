import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PublicResourceLibrary } from "./public-resource-library";
afterEach(()=>cleanup());
const resource={id:"10000000-0000-4000-8000-000000000001",title:"Fraction check",description:"Reviewed quiz.",resourceType:"quiz_answer_key",grade:"Grade 4",topic:"Fractions",lesson:"Equivalent fractions",difficulty:"core",minutes:15,tags:["fractions"],previewFileIds:[],downloadable:true} as const;
describe("Phase 8D public resource library",()=>{
  it("shows truthful empty state without fabricated curriculum",()=>{render(<PublicResourceLibrary kind="homework" resources={[]}/>);expect(screen.getByText(/No published homework yet/)).toBeTruthy();expect(screen.getByText(/No curriculum content has been fabricated/)).toBeTruthy();});
  it("labels answer keys separately and exposes only application download routes",()=>{render(<PublicResourceLibrary kind="quizzes" resources={[resource]}/>);expect(screen.getByText("Answer key")).toBeTruthy();const download=screen.getByRole("link",{name:"Download answer key"});expect(download.getAttribute("href")).toBe(`/resources/${resource.id}/download`);expect(document.body.textContent).not.toContain("resource-files");});
});
