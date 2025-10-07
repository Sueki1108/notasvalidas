"use client"

import type { ChangeEvent } from "react";
import { Upload, FileCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FileList = Record<string, File[] | null>;

interface FileUploadFormProps {
    requiredFiles: string[];
    files: FileList;
    onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClearFile: (fileName: string) => void;
    disabled?: boolean;
}

export function FileUploadForm({ requiredFiles, files, onFileChange, onClearFile, disabled = false }: FileUploadFormProps) {
    const getFileAcceptType = (fileName: string) => {
        if (fileName.toLowerCase().includes('txt')) {
            return '.txt';
        }
        if (fileName.toLowerCase().includes('xml')) {
            return '.xml, text/xml';
        }
        return ".xlsx,.xls,.csv,.ods,.slk,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/vnd.oasis.opendocument.spreadsheet,text/x-slk";
    }

    const getDisplayName = (fileName: string) => {
        if (fileName.toLowerCase().includes('xml')) return fileName;
        if (fileName.toLowerCase().includes('txt')) return fileName;
        return `${fileName}`;
    }
    
    const isMultiple = (fileName: string) => {
         return !fileName.toLowerCase().includes('sped txt');
    }

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {requiredFiles.map((name) => (
                <div key={name} className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/50 p-4 transition-all min-h-[160px] ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
                    {files[name] && files[name]!.length > 0 ? (
                        <>
                            <div className="absolute right-1 top-1 flex gap-1">
                                {!disabled && (
                                     <label htmlFor={name} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-7 w-7 cursor-pointer hover:bg-accent hover:text-accent-foreground">
                                        <Upload className="h-4 w-4" />
                                        <span className="sr-only">Adicionar mais arquivos</span>
                                     </label>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onClearFile(name)} disabled={disabled}>
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Limpar</span>
                                </Button>
                            </div>
                            <div className="flex flex-col items-center gap-2 text-center">
                                <FileCheck className="h-10 w-10 text-primary" />
                                <p className="font-semibold">{getDisplayName(name)}</p>
                                <p className="text-xs text-muted-foreground">
                                    {files[name]?.length} arquivo(s) carregado(s)
                                </p>
                            </div>
                        </>
                    ) : (
                         <>
                            <label htmlFor={name} className={`flex h-full w-full flex-col items-center justify-center text-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                <Upload className="h-10 w-10 text-muted-foreground" />
                                <p className="mt-2 font-semibold">{getDisplayName(name)}</p>
                                <p className="text-sm text-muted-foreground">
                                    Clique para carregar
                                </p>
                            </label>
                        </>
                    )}
                    <input
                        id={name}
                        name={name}
                        type="file"
                        accept={getFileAcceptType(name)}
                        className="sr-only"
                        onChange={onFileChange}
                        multiple={isMultiple(name)}
                        disabled={disabled}
                    />
                </div>
            ))}
        </div>
    );
}
