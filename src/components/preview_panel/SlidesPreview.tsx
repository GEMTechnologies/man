import { SlidesOutput } from "@/hooks/useAcademicOutputs";

interface SlidesPreviewProps {
  slides?: SlidesOutput;
}

export function SlidesPreview({ slides }: SlidesPreviewProps) {
  if (!slides || slides.slides.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <p className="text-sm font-medium">No slides generated yet.</p>
        <p className="max-w-sm text-xs">
          Ask Man to create a presentation or transform uploaded materials into
          a slide deck to see each slide preview here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          {slides.title}
        </h2>
        {slides.attributes.audience && (
          <p className="text-xs text-muted-foreground">
            Audience: {slides.attributes.audience}
          </p>
        )}
      </div>
      <div className="space-y-4">
        {slides.slides.map((slide, index) => (
          <div
            key={`${slide.title}-${index}`}
            className="rounded-xl border border-border bg-background p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
              <span>Slide {index + 1}</span>
              {slide.visuals && slide.visuals.length > 0 && (
                <span>{slide.visuals.join(", ")}</span>
              )}
            </div>
            <h3 className="text-xl font-semibold text-foreground">
              {slide.title}
            </h3>
            {slide.bullets.length > 0 && (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
                {slide.bullets.map((bullet, bulletIndex) => (
                  <li key={bulletIndex}>{bullet}</li>
                ))}
              </ul>
            )}
            {slide.notes && (
              <div className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                <strong className="block text-[11px] uppercase tracking-wide">
                  Presenter Notes
                </strong>
                <p className="mt-1 whitespace-pre-wrap">{slide.notes}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
