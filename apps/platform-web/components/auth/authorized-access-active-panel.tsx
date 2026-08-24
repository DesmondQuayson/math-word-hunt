import { exitSchoolAccessAction } from "@/app/school-access-actions";

export function AuthorizedAccessActivePanel() {
  return <section
    className="authorized-access-panel authorized-access-panel--compact"
    aria-labelledby="authorized-access-active-heading"
  >
    <h2 id="authorized-access-active-heading">Authorized access active</h2>
    <form action={exitSchoolAccessAction}>
      <button className="button button-secondary" type="submit">Exit authorized access</button>
    </form>
  </section>;
}
