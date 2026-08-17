import Image from "next/image";

type CatalogThumbnail = Readonly<{
  webp: string;
  avif?: string;
}>;

const PREMIUM_THUMBNAILS = Object.freeze({
  "math-vocabulary-hunt": Object.freeze({
    webp: "/media/games/math-vocabulary-hunt.webp",
    avif: "/media/games/math-vocabulary-hunt.avif"
  }),
  "number-logic": Object.freeze({
    webp: "/media/games/number-logic.webp",
    avif: "/media/games/number-logic.avif"
  }),
  "number-cross": Object.freeze({
    webp: "/media/games/number-cross.webp",
    avif: "/media/games/number-cross.avif"
  })
} satisfies Record<string, CatalogThumbnail>);

export function resolveGameCatalogThumbnail(stableKey: string, thumbnailReference: string): CatalogThumbnail | null {
  if (stableKey === "crosscalc") {
    return {
      webp: thumbnailReference === "builtin:crosscalc-v2"
        ? "/media/games/crosscalc-v2-rc.webp"
        : "/media/games/crosscalc.svg"
    };
  }
  return Object.prototype.hasOwnProperty.call(PREMIUM_THUMBNAILS, stableKey)
    ? PREMIUM_THUMBNAILS[stableKey as keyof typeof PREMIUM_THUMBNAILS]
    : null;
}

export function GameCatalogThumbnail({
  stableKey,
  thumbnailReference,
  title
}: Readonly<{ stableKey: string; thumbnailReference: string; title: string }>) {
  const thumbnail = resolveGameCatalogThumbnail(stableKey, thumbnailReference);
  if (!thumbnail) {
    return <div className="game-card-thumbnail-fallback" aria-label={`${title} thumbnail`} role="img">
      <span aria-hidden="true">MATHNEXA</span>
      <strong aria-hidden="true">{title}</strong>
    </div>;
  }
  return <picture>
    {thumbnail.avif ? <source srcSet={thumbnail.avif} type="image/avif" /> : null}
    <Image
      unoptimized
      width={1200}
      height={675}
      loading={stableKey === "math-vocabulary-hunt" ? "eager" : "lazy"}
      sizes="(max-width: 48rem) 100vw, 50vw"
      src={thumbnail.webp}
      alt={`${title} gameplay artwork`}
    />
  </picture>;
}
