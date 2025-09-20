import type { ComponentType } from "react";
import { useAtom } from "jotai";
import { previewModeAtom } from "@/atoms/appAtoms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, Presentation, Braces, Download } from "lucide-react";
import { useAcademicOutputs } from "@/hooks/useAcademicOutputs";
import { IpcClient } from "@/ipc/ipc_client";
import { showError, showSuccess } from "@/lib/toast";

const tabs: Array<{
  mode: "document" | "slides" | "raw";
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { mode: "document", label: "Document", icon: FileText },
  { mode: "slides", label: "Slides", icon: Presentation },
  { mode: "raw", label: "Raw Output", icon: Braces },
];

export function PreviewHeader() {
  const [previewMode, setPreviewMode] = useAtom(previewModeAtom);
  const { document, slides } = useAcademicOutputs();
  const ipc = IpcClient.getInstance();

  const handleExport = async (type: "docx" | "pdf" | "pptx") => {
    try {
      if (type === "docx" || type === "pdf") {
        if (!document) {
          showError("There is no generated document to export yet.");
          return;
        }

        const result =
          type === "docx"
            ? await ipc.exportDocumentAsDocx({
                title: document.title,
                format: document.format,
                body: document.body,
              })
            : await ipc.exportDocumentAsPdf({
                title: document.title,
                format: document.format,
                body: document.body,
              });

        if (result?.canceled) {
          return;
        }
        showSuccess(`Saved ${type.toUpperCase()} to ${result?.filePath ?? "disk"}.`);
        return;
      }

      if (!slides || slides.slides.length === 0) {
        showError("There is no generated slide deck to export yet.");
        return;
      }

      const result = await ipc.exportSlidesAsPptx({
        title: slides.title,
        slides: slides.slides,
      });
      if (result?.canceled) {
        return;
      }
      showSuccess(`Saved PPTX to ${result?.filePath ?? "disk"}.`);
    } catch (error) {
      console.error("Failed to export academic artifact", error);
      showError("Sorry, something went wrong while exporting. Please try again.");
    }
  };

  return (
    <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
      <div className="flex items-center gap-2">
        {tabs.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              previewMode === mode
                ? "bg-background shadow-sm"
                : "hover:bg-muted text-muted-foreground",
            )}
            onClick={() => setPreviewMode(mode)}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExport("docx")}
          disabled={!document}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          <span>Export DOCX</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExport("pdf")}
          disabled={!document}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          <span>Export PDF</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExport("pptx")}
          disabled={!slides || slides.slides.length === 0}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          <span>Export PPTX</span>
        </Button>
      </div>
    </div>
  );
}
