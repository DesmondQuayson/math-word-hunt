import { Notice } from "./notice";

export function PrototypeDataNotice() {
  return (
    <Notice
      label="Demonstration data"
      tone="warning"
      className="prototype-data-notice"
    >
      <strong>Demonstration data</strong>
      <p>
        These records exist only to test the future layout. They are not saved,
        connected to an account, or evidence of a working classroom service.
      </p>
    </Notice>
  );
}
