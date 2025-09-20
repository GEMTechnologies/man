import { DocumentOutput } from "@/hooks/useAcademicOutputs";
import { VanillaMarkdownParser } from "@/components/chat/ManMarkdownParser";

interface DocumentPreviewProps {
  document?: DocumentOutput;
}

export function DocumentPreview({ document }: DocumentPreviewProps) {
  if (!document) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <p className="text-sm font-medium">No document generated yet.</p>
        <p className="max-w-md text-xs">
          Ask Man to draft a research paper or expand an existing upload to
          see a formatted manuscript preview here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold leading-tight text-foreground">
          {document.title}
        </h1>
        {document.attributes.subtitle && (
          <p className="mt-2 text-sm text-muted-foreground">
            {document.attributes.subtitle}
          </p>
        )}
      </header>
      <article className="prose prose-neutral max-w-none dark:prose-invert">
        {document.format === "html" ? (
          <div
            dangerouslySetInnerHTML={{ __html: document.body }}
            className="space-y-4"
          />
        ) : (
          <VanillaMarkdownParser content={document.body} />
        )}
      </article>
    </div>
  );
}
