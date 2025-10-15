// src/app/separar-xml/page.tsx
"use client";

import * as React from "react";
import { useState, type ChangeEvent } from "react";
import Link from 'next/link';
import { Sheet, UploadCloud, Download, Trash2, File as FileIcon, Loader2, History, Group, ChevronDown, FileText, FolderSync, Search, Replace, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { separateXmlFromExcel } from "@/app/actions";

export default function SepararXmlPage() {
    const [excelFile, setExcelFile] = useState<File | null>(null);
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>, fileType: 'excel' | 'zip') => {
        if (e.target.files && e.target.files[0]) {
            if (fileType === 'excel') {
                setExcelFile(e.target.files[0]);
            } else {
                setZipFile(e.target.files[0]);
            }
        }
    };
    
    const handleClearFiles = () => {
        setExcelFile(null);
        setZipFile(null);
        setError(null);
        (document.getElementById('excel-upload') as HTMLInputElement).value = "";
        (document.getElementById('zip-upload') as HTMLInputElement).value = "";
        toast({ title: "Arquivos removidos" });
    };

    const handleSubmit = async () => {
        if (!excelFile || !zipFile) {
            toast({
                variant: "destructive",
                title: "Arquivos Faltando",
                description: "Por favor, carregue o arquivo Excel e o arquivo ZIP.",
            });
            return;
        }

        setError(null);
        setProcessing(true);

        try {
            const fileToBase64 = (file: File): Promise<string> => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = error => reject(error);
                });
            };

            const excelFileBase64 = await fileToBase64(excelFile);
            const zipFileBase64 = await fileToBase64(zipFile);

            const result = await separateXmlFromExcel({
                excelFile: excelFileBase64,
                zipFile: zipFileBase64,
            });

            if (result.error) throw new Error(result.error);

            // Trigger download for the separated ZIP file
            if (result.separatedZip) {
                const link = document.createElement('a');
                link.href = `data:application/zip;base64,${result.separatedZip}`;
                link.download = 'xmls_separados.zip';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            // Trigger download for the found keys Excel file
            if (result.foundKeysExcel) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.foundKeysExcel}`;
                link.download = 'chaves_encontradas.xlsx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            
            toast({
                title: "Processamento Concluído",
                description: "Os downloads do ZIP com os XMLs separados e da planilha com as chaves encontradas foram iniciados.",
            });

        } catch (err: any) {
            setError(err.message || "Ocorreu um erro desconhecido.");
            toast({
                variant: "destructive",
                title: "Erro no Processamento",
                description: err.message,
            });
        } finally {
            setProcessing(false);
        }
    };

    const FileUploadArea = ({ title, file, onChange, accept, id }: { title: string, file: File | null, onChange: (e: ChangeEvent<HTMLInputElement>) => void, accept: string, id: string }) => (
        <div className="space-y-2">
            <h3 className="text-lg font-semibold">{title}</h3>
            <div className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-all ${file ? 'border-primary' : 'border-border'}`}>
                <label htmlFor={id} className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-center">
                    {file ? (
                        <>
                            <FileIcon className="h-12 w-12 text-primary" />
                            <p className="mt-4 font-semibold text-primary truncate max-w-full px-2">{file.name}</p>
                        </>
                    ) : (
                        <>
                            <UploadCloud className="h-12 w-12 text-muted-foreground" />
                            <p className="mt-4 font-semibold">Clique para carregar o arquivo</p>
                        </>
                    )}
                </label>
                <input
                    id={id}
                    name={id}
                    type="file"
                    className="sr-only"
                    onChange={onChange}
                    accept={accept}
                />
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2">
                            <Sheet className="h-6 w-6 text-primary" />
                            <h1 className="text-xl font-bold font-headline">Excel Workflow Automator</h1>
                        </Link>
                    </div>
                     <nav className="flex items-center gap-4">
                        <Button variant="ghost" asChild><Link href="/">Processamento Principal</Link></Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost">Ferramentas <ChevronDown className="ml-2 h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem asChild><Link href="/merger" className="flex items-center gap-2 w-full"><Group />Agrupador de Planilhas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/juntar-abas" className="flex items-center gap-2 w-full"><Layers />Juntar Abas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/sage-itens-nf" className="flex items-center gap-2 w-full"><FileText />Sage - Itens da NF</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/unify-folders" className="flex items-center gap-2 w-full"><FolderSync />Unificar Pastas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/extract-nfe" className="flex items-center gap-2 w-full"><Search />Extrair NF-e</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/extract-cte" className="flex items-center gap-2 w-full"><Search />Extrair CT-e</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/returns" className="flex items-center gap-2 w-full"><FileText />Devoluções</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/alterar-xml" className="flex items-center gap-2 w-full"><Replace />Alterar XML</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/separar-xml" className="flex items-center gap-2 w-full"><FileText />Separar XML</Link></DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="ghost" asChild><Link href="/history">Histórico</Link></Button>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                <div className="mx-auto max-w-4xl space-y-8">
                    <Card className="shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <FileText className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Separar XMLs por Planilha</CardTitle>
                                    <CardDescription>Carregue uma planilha de chaves e um ZIP de XMLs para separar os arquivos correspondentes.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <FileUploadArea 
                                    title="1. Planilha de Chaves"
                                    file={excelFile}
                                    onChange={(e) => handleFileChange(e, 'excel')}
                                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                    id="excel-upload"
                                />
                                <FileUploadArea 
                                    title="2. Arquivo ZIP com XMLs"
                                    file={zipFile}
                                    onChange={(e) => handleFileChange(e, 'zip')}
                                    accept=".zip,application/zip"
                                    id="zip-upload"
                                />
                            </div>

                            {error && (
                                <Alert variant="destructive">
                                    <FileIcon className="h-4 w-4" />
                                    <AlertTitle>Erro</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button onClick={handleSubmit} disabled={processing || !excelFile || !zipFile} className="flex-grow">
                                    {processing ? <><Loader2 className="animate-spin" /> Processando...</> : <><Download /> Separar e Baixar</>}
                                </Button>
                                <Button onClick={handleClearFiles} variant="destructive" className="flex-shrink-0" disabled={!excelFile && !zipFile}>
                                    <Trash2 /> Limpar Arquivos
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>

            <footer className="mt-12 border-t py-6">
                <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
                    <p>Powered by Firebase Studio. Interface intuitiva para automação de fluxos de trabalho.</p>
                </div>
            </footer>
        </div>
    );
}
