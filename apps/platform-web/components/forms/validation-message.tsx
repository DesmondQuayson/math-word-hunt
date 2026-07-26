type ValidationMessageProps = Readonly<{
  id: string;
  message?: string;
}>;

export function ValidationMessage({ id, message }: ValidationMessageProps) {
  if (!message) return null;
  return (
    <p className="validation-message" id={id}>
      {message}
    </p>
  );
}
