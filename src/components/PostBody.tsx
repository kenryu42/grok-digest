import { cn } from "cn";
import { LinkCard } from "./LinkCard.tsx";
import { textPieces, type PostPart } from "../lib/media.ts";

export function PostBody({ parts, className }: { parts: readonly PostPart[]; className?: string }) {
  return (
    <blockquote className={cn("flex flex-col gap-3 leading-relaxed text-pretty text-foreground/80", className)}>
      {parts.map((part) => {
        if (part.kind === "text") return <PostText key={`text-${part.text}`} text={part.text} />;
        if (part.kind === "link") {
          return (
            <div key={`link-${part.link.url}`} data-post-link className="max-w-md">
              <LinkCard {...part.link} />
            </div>
          );
        }
        const { images } = part;
        return (
          <ul
            key={`images-${images.map(({ url }) => url).join(" ")}`}
            data-post-images
            aria-label="Images in the post"
            className={cn("grid max-w-md gap-2", images.length > 1 && "grid-cols-2")}
          >
            {images.map((image, index) => (
              <li
                key={image.url}
                className={cn(index === 0 && images.length > 1 && images.length % 2 === 1 && "col-span-2")}
              >
                <a
                  href={image.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-lg border border-border bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <img
                    src={image.url}
                    alt={image.alt}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "w-full",
                      images.length === 1 ? "max-h-[32rem] min-h-24 object-contain" : "aspect-video object-cover",
                    )}
                  />
                </a>
              </li>
            ))}
          </ul>
        );
      })}
    </blockquote>
  );
}

function PostText({ text }: { text: string }) {
  return (
    <p data-read-post className="whitespace-pre-wrap">
      {textPieces(text).map((piece) =>
        piece.kind === "text" ? (
          piece.text
        ) : (
          <a
            key={piece.at}
            href={piece.url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-foreground underline decoration-border underline-offset-2 hover:decoration-brand"
          >
            {piece.url}
          </a>
        ),
      )}
    </p>
  );
}
