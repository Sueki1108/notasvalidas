// src/app/alterar-xml/page.tsx
"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import Link from 'next/link';
import { Sheet, Replace, UploadCloud, File as FileIcon, ChevronDown, History, Group, FileText, FolderSync, Search, Loader2, Download, Trash2, Wand2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getXmlPaths, processXmls } from "@/app/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


export default function AlterarXmlPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [paths, setPaths] = useState<string[]>([]);
    const [selectedPath, setSelectedPath] = useState<string>('');
    const [newText, setNewText] = useState<string>('');
    const [documentType, setDocumentType] = useState<'NFE' | 'CTE'>('NFE');
    const [isLoadingPaths, setIsLoadingPaths] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { toast } = useToast();
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const uploadedFiles = Array.from(e.target.files);
            setFiles(uploadedFiles);
            setError(null);
            setPaths([]);
            setSelectedPath('');

            if (uploadedFiles.length > 0) {
                setIsLoadingPaths(true);
                try {
                    const firstFile = uploadedFiles[0];
                    const fileContent = await firstFile.text();
                    const result = await getXmlPaths({ name: firstFile.name, content: fileContent });
                    if(result.error) throw new Error(result.error);
                    setPaths(result.paths || []);
                    toast({title: "Arquivo analisado", description: "Caminhos XML extraídos. Selecione a tag para alterar."})
                } catch (err: any) {
                    setError('Falha ao analisar o arquivo XML. Verifique se o arquivo é válido.');
                     toast({variant: 'destructive', title: "Erro ao Analisar XML", description: err.message});
                } finally {
                    setIsLoadingPaths(false);
                }
            }
        }
    };
    
    const handleClear = () => {
        setFiles([]);
        setPaths([]);
        setSelectedPath('');
        setNewText('');
        setError(null);
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    const handleSubmit = async () => {
        if (!selectedPath || newText === '') {
            toast({
                variant: "destructive",
                title: "Campos Incompletos",
                description: "Por favor, selecione uma tag e digite o novo texto.",
            });
            return;
        }

        setIsProcessing(true);
        setError(null);

        try {
            const fileContents = await Promise.all(
                files.map(file => {
                    return new Promise<{ name: string, content: string }>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                             if (event.target?.result) {
                                resolve({ name: file.name, content: event.target.result as string });
                            } else {
                                reject(new Error(`Falha ao ler o arquivo ${file.name}`));
                            }
                        };
                        reader.onerror = () => reject(new Error(`Erro ao ler o arquivo ${file.name}`));
                        reader.readAsText(file);
                    });
                })
            );

            const result = await processXmls({
                files: fileContents,
                selectedPath,
                newText,
                docType: documentType
            });

            if (result.error) throw new Error(result.error);

            if (result.base64Data) {
                 const byteCharacters = atob(result.base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/zip' });

                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'arquivos_xml_modificados.zip';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                toast({
                    title: "Processamento Concluído",
                    description: "O download do arquivo .zip com os XMLs modificados foi iniciado.",
                });
            }

        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro desconhecido.');
            toast({variant: 'destructive', title: "Erro no Processamento", description: err.message});
        } finally {
            setIsProcessing(false);
        }

    }


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
                                <DropdownMenuItem asChild><Link href="/sage-itens-nf" className="flex items-center gap-2 w-full"><FileText />Sage - Itens da NF</Link></DropdownMenuItem>
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
                 <div className="mx-auto max-w-4xl space-y-8">
                    <Card className="shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Replace className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Alterar XML em Lote</CardTitle>
                                    <CardDescription>Carregue arquivos XML, escolha uma tag e substitua seu texto em todos os arquivos.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Passo 1: Upload */}
                             <div className="space-y-2">
                                <h3 className="text-lg font-semibold">1. Carregar Arquivos XML</h3>
                                <div className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/50 p-8 transition-all">
                                    <label htmlFor="file-upload" className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-center">
                                        <UploadCloud className="h-12 w-12 text-muted-foreground" />
                                        <p className="mt-4 font-semibold">Clique para carregar os arquivos XML</p>
                                        <p className="text-sm text-muted-foreground">O primeiro arquivo será usado para extrair as tags.</p>
                                    </label>
                                    <input
                                        ref={fileInputRef}
                                        id="file-upload"
                                        name="file-upload"
                                        type="file"
                                        className="sr-only"
                                        onChange={handleFileChange}
                                        multiple
                                        accept=".xml, text/xml"
                                    />
                                </div>
                                 {files.length > 0 && (
                                    <div className="space-y-2 pt-4">
                                        <h4 className="font-medium">Arquivos Carregados ({files.length}):</h4>
                                        <div className="max-h-32 overflow-y-auto rounded-md border p-2">
                                            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                                                {files.map((file, index) => (
                                                    <li key={index} className="flex items-center gap-2 text-sm">
                                                        <FileIcon className="h-4 w-4 text-primary"/>
                                                        <span className="truncate">{file.name}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Passo 2: Selecionar Tag */}
                            {(isLoadingPaths || paths.length > 0) && (
                                <div className="space-y-2">
                                    <h3 className="text-lg font-semibold">2. Escolher a Tag para Alterar</h3>
                                     {isLoadingPaths ? (
                                        <div className="flex items-center justify-center p-4">
                                            <Loader2 className="animate-spin text-primary" />
                                            <p className="ml-2">Analisando XML...</p>
                                        </div>
                                    ) : (
                                        <Select value={selectedPath} onValueChange={setSelectedPath}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione o caminho da tag..." />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-60">
                                                {paths.map((path, index) => (
                                                    <SelectItem key={index} value={path}>{path}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                            )}

                             {/* Passo 3: Inserir Texto */}
                            {selectedPath && (
                                <div className="space-y-2">
                                    <h3 className="text-lg font-semibold">3. Digite o Novo Texto</h3>
                                    <div className="grid w-full items-center gap-1.5">
                                        <Label htmlFor="new-text">Texto para substituir o conteúdo da tag '{selectedPath.split('/').pop()}'</Label>
                                        <Input
                                            id="new-text"
                                            value={newText}
                                            onChange={(e) => setNewText(e.target.value)}
                                            placeholder="Digite o novo conteúdo aqui..."
                                        />
                                    </div>
                                </div>
                            )}
                            
                            {error && (
                                <Alert variant="destructive">
                                    <FileIcon className="h-4 w-4" />
                                    <AlertTitle>Erro</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            {/* Passo 4: Ação */}
                            <div className="flex flex-col gap-2 sm:flex-row">
                                 <Button 
                                    onClick={handleSubmit} 
                                    disabled={isProcessing || !selectedPath || newText === ''} 
                                    className="flex-grow"
                                >
                                    {isProcessing ? <><Loader2 className="animate-spin" /> Processando...</> : <><Wand2 /> Alterar e Baixar .zip</>}
                                </Button>
                                <Button onClick={handleClear} variant="destructive" className="flex-shrink-0" disabled={files.length === 0}>
                                    <Trash2 /> Limpar Tudo
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

    

