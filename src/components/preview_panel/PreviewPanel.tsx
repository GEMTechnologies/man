import { useAtomValue } from "jotai";
import { previewModeAtom } from "@/atoms/appAtoms";
import { useAcademicOutputs } from "@/hooks/useAcademicOutputs";
import { DocumentPreview } from "./DocumentPreview";
import { SlidesPreview } from "./SlidesPreview";
import { RawOutputPreview } from "./RawOutputPreview";

export function PreviewPanel() {
  const previewMode = useAtomValue(previewModeAtom);
  const { document, slides, raw } = useAcademicOutputs();

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-hidden">
        {previewMode === "document" && <DocumentPreview document={document} />}
        {previewMode === "slides" && <SlidesPreview slides={slides} />}
        {previewMode === "raw" && <RawOutputPreview raw={raw} />}
      </div>
    </div>
  );
}
