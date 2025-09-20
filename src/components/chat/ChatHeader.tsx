import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "../ui/button";

interface ChatHeaderProps {
  isPreviewOpen: boolean;
  onTogglePreview: () => void;
}

export function ChatHeader({ isPreviewOpen, onTogglePreview }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Research Workspace</h1>
        <p className="text-xs text-muted-foreground">
          Upload scholarly materials or describe your topic to generate papers and presentations.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onTogglePreview}
        className="flex items-center gap-2"
      >
        {isPreviewOpen ? (
          <>
            <PanelRightClose className="h-4 w-4" />
            <span>Hide Preview</span>
          </>
        ) : (
          <>
            <PanelRightOpen className="h-4 w-4" />
            <span>Show Preview</span>
          </>
        )}
      </Button>
    </div>
  );
}
