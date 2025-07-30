"use client"

import type { ChangeEvent } from "react";
import { Upload, File, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FileList = Record<string, File | null>;

interface FileUploadFormProps {
    requiredFiles: string[];
    files: FileList;
    onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClearFile: (fileName: string) => void;
}

export function FileUploadForm({ requiredFiles, files, onFileChange, onClearFile }: FileUploadFormProps) {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {requiredFiles.map((name) => (
                <div key={name} className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/50 p-4 transition-all">
                    {files[name] ? (
                        <>
                            <div className="absolute right-1 top-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onClearFile(name)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex flex-col items-center gap-2 text-center">
                                <File className="h-10 w-10 text-primary" />
                                <p className="font-semibold">{name}.xlsx</p>
                                <p className="text-xs text-muted-foreground truncate max-w-full">{files[name]?.name}</p>
                            </div>
                        </>
                    ) : (
                         <>
                            <label htmlFor={name} className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-center">
                                <Upload className="h-10 w-10 text-muted-foreground" />
                                <p className="mt-2 font-semibold">{name}.xlsx</p>
                                <p className="text-sm text-muted-foreground">Clique para carregar</p>
                            </label>
                            <input
                                id={name}
                                name={name}
                                type="file"
                                accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                                className="sr-only"
                                onChange={onFileChange}
                            />
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}
