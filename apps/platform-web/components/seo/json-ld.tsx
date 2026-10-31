/**
 * Schema.org JSON-LD as a plain text child. React escapes any "<script" or
 * "</script" inside script text (as "script", still valid JSON), so the
 * data can never close the element early, and no raw-HTML API is needed.
 */
export function JsonLd({ data }: Readonly<{ data: object }>) {
  return <script type="application/ld+json">{JSON.stringify(data)}</script>;
}
