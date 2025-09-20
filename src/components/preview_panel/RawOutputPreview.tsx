import { RawOutput } from "@/hooks/useAcademicOutputs";

interface RawOutputPreviewProps {
  raw?: RawOutput;
}

export function RawOutputPreview({ raw }: RawOutputPreviewProps) {
  if (!raw) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <p className="text-sm font-medium">No raw output available.</p>
        <p className="max-w-sm text-xs">
          Switch back to the chat and ask Man to generate a paper or
          presentation. The streaming response will appear here for auditing.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        <span>Raw AI Output</span>
        <span>{raw.format.toUpperCase()}</span>
      </div>
      <pre className="max-h-full whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs leading-relaxed text-foreground">
        {raw.content}
      </pre>
    </div>
  );
}
