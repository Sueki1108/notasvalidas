// src/app/merger/page.tsx
"use client";

import * as React from "react";
import { useState, type ChangeEvent } from "react";
import Link from 'next/link';
import { Sheet, UploadCloud, Group, Download, Trash2, File as FileIcon, Loader2, History, ChevronDown, FileText, FolderSync, Search, Replace, Layers, Wand2 } from "lucide-react";
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
import { mergeExcelFiles } from "@/app/actions";

export default function MergerPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(prevFiles => [...prevFiles, ...Array.from(e.target.files!)]);
        }
    };

    const handleClearFiles = () => {
        setFiles([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        toast({
            title: "Arquivos removidos",
            description: "A lista de arquivos para agrupar foi limpa.",
        });
    };

    const handleSubmit = async () => {
        if (files.length < 2) {
            toast({
                variant: "destructive",
                title: "Arquivos Insuficientes",
                description: "Por favor, carregue pelo menos duas planilhas para agrupar.",
            });
            return;
        }

        setError(null);
        setProcessing(true);

        try {
            const fileContents = await Promise.all(
                files.map(file => {
                    return new Promise<{ name: string, content: string }>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                             if (event.target?.result) {
                                // result is a data URL (e.g., "data:application/octet-stream;base64,xxxx...")
                                // We only need the base64 part
                                const content = (event.target.result as string).split(',')[1];
                                resolve({ name: file.name, content });
                            } else {
                                reject(new Error(`Falha ao ler o arquivo ${file.name}`));
                            }
                        };
                        reader.onerror = () => reject(new Error(`Erro ao ler o arquivo ${file.name}`));
                        reader.readAsDataURL(file);
                    });
                })
            );
            
            const result = await mergeExcelFiles(fileContents);

            if (result.error) {
                throw new Error(result.error);
            }
            
            if(result.base64Data) {
                const byteCharacters = atob(result.base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.oasis.opendocument.spreadsheet' });

                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'Planilhas_Agrupadas.ods';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                toast({
                    title: "Agrupamento Concluído",
                    description: "O download da sua planilha agrupada foi iniciado.",
                });
            }

        } catch (err: any) {
            const errorMessage = err.message || "Ocorreu um erro desconhecido.";
            setError(errorMessage);
            toast({
                variant: "destructive",
                title: "Erro no Agrupamento",
                description: errorMessage,
            });
        } finally {
            setProcessing(false);
        }
    };


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
                        <Button variant="ghost" asChild>
                            <Link href="/">Processamento Principal</Link>
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost">Ferramentas <ChevronDown className="ml-2 h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem asChild><Link href="/merger" className="flex items-center gap-2 w-full"><Group />Agrupador de Planilhas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/juntar-abas" className="flex items-center gap-2 w-full"><Layers />Juntar Abas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/solver" className="flex items-center gap-2 w-full"><Wand2 />Solver</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/unify-folders" className="flex items-center gap-2 w-full"><FolderSync />Unificar Pastas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/extract-nfe" className="flex items-center gap-2 w-full"><Search />Extrair NF-e</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/extract-cte" className="flex items-center gap-2 w-full"><Search />Extrair CT-e</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/returns" className="flex items-center gap-2 w-full"><FileText />Devoluções</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/alterar-xml" className="flex items-center gap-2 w-full"><Replace />Alterar XML</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/separar-xml" className="flex items-center gap-2 w-full"><FileText />Separar XML</Link></DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="ghost" asChild>
                           <Link href="/history">Histórico</Link>
                        </Button>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                <div className="mx-auto max-w-3xl space-y-8">
                     <Card className="shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Group className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Agrupador de Planilhas</CardTitle>
                                    <CardDescription>Carregue múltiplas planilhas para juntá-las em um único arquivo Excel.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/50 p-8 transition-all">
                                <label htmlFor="file-upload" className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-center">
                                    <UploadCloud className="h-12 w-12 text-muted-foreground" />
                                    <p className="mt-4 font-semibold">Clique para carregar as planilhas</p>
                                    <p className="text-sm text-muted-foreground">
                                        Você pode selecionar múltiplos arquivos (.xlsx, .xls, .csv, .ods)
                                    </p>
                                </label>
                                <input
                                    ref={fileInputRef}
                                    id="file-upload"
                                    name="file-upload"
                                    type="file"
                                    className="sr-only"
                                    onChange={handleFileChange}
                                    multiple
                                    accept=".xlsx,.xls,.csv,.ods,.slk,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/vnd.oasis.opendocument.spreadsheet,text/x-slk"
                                />
                            </div>

                            {files.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="font-medium">Arquivos Carregados ({files.length}):</h4>
                                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-md border p-4">
                                        {files.map((file, index) => (
                                            <li key={index} className="flex items-center gap-2 text-sm">
                                                <FileIcon className="h-4 w-4 text-primary"/>
                                                <span className="truncate">{file.name}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                             {error && (
                                <Alert variant="destructive">
                                    <FileIcon className="h-4 w-4" />
                                    <AlertTitle>Erro</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button onClick={handleSubmit} disabled={processing || files.length < 2} className="flex-grow">
                                    {processing ? <><Loader2 className="animate-spin" /> Processando...</> : <><Download /> Agrupar e Baixar</>}
                                </Button>
                                <Button onClick={handleClearFiles} variant="destructive" className="flex-shrink-0" disabled={files.length === 0}>
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
