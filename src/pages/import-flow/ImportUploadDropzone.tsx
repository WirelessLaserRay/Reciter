import React from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPT } from "./types";

interface ImportUploadDropzoneProps {
  dragOver: boolean;
  setDragOver: (val: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFile: (file: File) => void;
}

export default function ImportUploadDropzone({
  dragOver,
  setDragOver,
  fileInputRef,
  onFile,
}: ImportUploadDropzoneProps) {
  return (
    <>
      <div
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-16 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "hover:border-primary/50"
        )}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
      >
        <Upload className="size-10 text-muted-foreground" />
        <div className="font-medium">拖拽文件到这里，或点击选择文件</div>
        <p className="text-sm text-muted-foreground">
          .md / .csv / .json / .txt / .apkg (Anki)
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}
