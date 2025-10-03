// src/app/returns/page.tsx
"use client";
import * as React from "react";
import { useState, type ChangeEvent } from "react";
import Link from 'next/link';
import { Sheet, UploadCloud, Download, Trash2, File as FileIcon, Loader2, History, Group, ChevronDown, FileText, FolderSync, Search, ArrowRight } from "lucide-react";
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
import { extractReturnData } from "@/app/actions";

export default function ReturnsPage() {
    const [devolutionFiles, setDevolutionFiles] = useState<File[]>([]);
    const [referencedFiles, setReferencedFiles] = useState<File[]>([]);
    const [processing, setProcessing] = useState<null | 'devolutions' | 'referenced'>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>, type: 'devolutions' | 'referenced') => {
        if (e.target.files) {
            if (type === 'devolutions') {
                setDevolutionFiles(prev => [...prev, ...Array.from(e.target.files!)]);
            } else {
                setReferencedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
            }
        }
    };
    
    const handleClearFiles = (type: 'devolutions' | 'referenced' | 'all') => {
        if(type === 'devolutions' || type === 'all'){
            setDevolutionFiles([]);
            (document.getElementById('devolutions-upload') as HTMLInputElement).value = "";
        }
        if(type === 'referenced' || type === 'all'){
            setReferencedFiles([]);
            (document.getElementById('referenced-upload') as HTMLInputElement).value = "";
        }
        toast({
            title: "Arquivos removidos",
        });
    };

    const handleSubmit = async (type: 'devolutions' | 'referenced') => {
        const files = type === 'devolutions' ? devolutionFiles : referencedFiles;
        const outputFilename = type === 'devolutions' ? 'relatorio_devolucoes.xlsx' : 'relatorio_referenciadas.xlsx';

        if (files.length === 0) {
            toast({
                variant: "destructive",
                title: "Nenhum Arquivo",
                description: `Por favor, carregue pelo menos um arquivo XML para ${type === 'devolutions' ? 'Devoluções' : 'Referenciadas'}.`,
            });
            return;
        }

        setError(null);
        setProcessing(type);

        try {
            const fileContents = await Promise.all(
                files.map(file => 
                    file.text().then(content => ({ name: file.name, content }))
                )
            );
            
            const result = await extractReturnData(fileContents);

            if (result.error) throw new Error(result.error);
            
            if(result.base64Data) {
                const byteCharacters = atob(result.base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = outputFilename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                toast({
                    title: "Extração Concluída",
                    description: `O download de ${outputFilename} foi iniciado.`,
                });
            }

        } catch (err: any) {
            const errorMessage = err.message || "Ocorreu um erro desconhecido.";
            setError(errorMessage);
            toast({ variant: "destructive", title: "Erro na Extração", description: errorMessage });
        } finally {
            setProcessing(null);
        }
    };

    const renderFileList = (files: File[]) => (
         <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-md border p-4">
            {files.map((file, index) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                    <FileIcon className="h-4 w-4 text-primary"/>
                    <span className="truncate">{file.name}</span>
                </li>
            ))}
        </ul>
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
                        <Button variant="ghost" asChild>
                            <Link href="/">Processamento Principal</Link>
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost">Ferramentas <ChevronDown className="ml-2 h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem asChild><Link href="/merger" className="flex items-center gap-2 w-full"><Group />Agrupador de Planilhas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/sage-itens-nf" className="flex items-center gap-2 w-full"><FileText />Sage - Itens da NF</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/unify-folders" className="flex items-center gap-2 w-full"><FolderSync />Unificar Pastas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/extract-nfe" className="flex items-center gap-2 w-full"><Search />Extrair NF-e</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/extract-cte" className="flex items-center gap-2 w-full"><Search />Extrair CT-e</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/returns" className="flex items-center gap-2 w-full"><FileText />Devoluções</Link></DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="ghost" asChild><Link href="/history">Histórico</Link></Button>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                 <div className="mx-auto max-w-6xl space-y-8">
                    <div className="flex items-center gap-3">
                        <FileText className="h-8 w-8 text-primary" />
                        <div>
                            <h1 className="font-headline text-3xl">Análise de Devoluções</h1>
                            <p className="text-muted-foreground">Carregue os XMLs de devolução e os XMLs das notas referenciadas para gerar relatórios detalhados por item.</p>
                        </div>
                    </div>

                    {error && (
                        <Alert variant="destructive">
                            <FileIcon className="h-4 w-4" />
                            <AlertTitle>Erro</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                        {/* Card Devoluções */}
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle className="font-headline text-2xl">1. Notas de Devolução</CardTitle>
                                <CardDescription>Carregue os arquivos XML das notas fiscais de devolução.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <label htmlFor="devolutions-upload" className="flex flex-col items-center justify-center w-full h-32 px-4 transition bg-secondary/50 border-2 border-border border-dashed rounded-lg cursor-pointer hover:bg-secondary">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <UploadCloud className="w-8 h-8 mb-4 text-muted-foreground" />
                                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Clique para carregar</span> ou arraste e solte</p>
                                    </div>
                                    <input id="devolutions-upload" type="file" className="sr-only" onChange={(e) => handleFileChange(e, 'devolutions')} multiple accept=".xml, text/xml" />
                                </label>
                                {devolutionFiles.length > 0 && (
                                    <div>
                                        <h4 className="font-medium mb-2">Arquivos Carregados:</h4>
                                        {renderFileList(devolutionFiles)}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                <Button onClick={() => handleSubmit('devolutions')} disabled={processing === 'devolutions' || devolutionFiles.length === 0} className="w-full">
                                    {processing === 'devolutions' ? <><Loader2 className="animate-spin" /> Processando...</> : <><Download className="mr-2"/> Baixar Relatório de Devoluções</>}
                                </Button>
                                 <Button onClick={() => handleClearFiles('devolutions')} variant="destructive" size="icon" disabled={devolutionFiles.length === 0}><Trash2/></Button>
                                 </div>
                            </CardContent>
                        </Card>

                        {/* Card Referenciadas */}
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle className="font-headline text-2xl">2. Notas Referenciadas</CardTitle>
                                <CardDescription>Carregue os XMLs das notas fiscais originais que foram referenciadas nas devoluções.</CardDescription>
                            </CardHeader>
                             <CardContent className="space-y-6">
                                <label htmlFor="referenced-upload" className="flex flex-col items-center justify-center w-full h-32 px-4 transition bg-secondary/50 border-2 border-border border-dashed rounded-lg cursor-pointer hover:bg-secondary">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <UploadCloud className="w-8 h-8 mb-4 text-muted-foreground" />
                                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Clique para carregar</span> ou arraste e solte</p>
                                    </div>
                                    <input id="referenced-upload" type="file" className="sr-only" onChange={(e) => handleFileChange(e, 'referenced')} multiple accept=".xml, text/xml" />
                                </label>
                                {referencedFiles.length > 0 && (
                                     <div>
                                        <h4 className="font-medium mb-2">Arquivos Carregados:</h4>
                                        {renderFileList(referencedFiles)}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                <Button onClick={() => handleSubmit('referenced')} disabled={processing === 'referenced' || referencedFiles.length === 0} className="w-full">
                                    {processing === 'referenced' ? <><Loader2 className="animate-spin" /> Processando...</> : <><Download className="mr-2"/> Baixar Relatório de Referenciadas</>}
                                </Button>
                                <Button onClick={() => handleClearFiles('referenced')} variant="destructive" size="icon" disabled={referencedFiles.length === 0}><Trash2/></Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
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
