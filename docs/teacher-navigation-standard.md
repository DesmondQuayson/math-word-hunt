# Teacher Navigation Standard

Status: accepted prototype standard for the future platform shell.

## Destinations and order

Use exactly: Overview, Classes, Activities, Live Sessions, Reports,
Curriculum, Account. Keep task nouns stable across navigation, breadcrumbs,
page titles, and calls to action.

## Interaction rules

- Use semantic links inside a named `nav` landmark.
- Mark the active parent section with `aria-current="page"`, including on new
  and detail routes.
- Add the visible word `Current`; do not rely on color or a marker alone.
- Keep targets at least 44px in both compact and wide layouts.
- Preserve visible keyboard focus and logical DOM/tab order.
- Keep the full information architecture visible at mobile and tablet widths;
  reflow it to a two- or four-column grid instead of hiding it in a hover menu.
- Use breadcrumbs on create and detail workflows; the current item is text, not
  a redundant link.

The product-wide header remains separate from teacher workspace navigation.
The current v7 gateway stays under Play and is linked from teacher workflows
when the teacher needs a real game action.
