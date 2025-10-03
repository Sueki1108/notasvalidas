// src/app/sage-itens-nf/page.tsx
"use client";

import * as React from "react";
import { useState, type ChangeEvent } from "react";
import Link from 'next/link';
import { Sheet, UploadCloud, Download, Trash2, File as FileIcon, Loader2, History, Group, ChevronDown, FileText } from "lucide-react";
import * as XLSX from "xlsx";

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
import { DataTable } from "@/components/app/data-table";
import { getColumns } from "@/lib/columns-helper";

type ProcessedData = {
    [key: string]: any[];
}

export default function SageItensNfPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
    const { toast } = useToast();
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const newHeaders = [
        'Itens da Nota', 'Valor do Item', 'Desconto', 'Frete/Seg/Desp',
        'CFOP', 'CST', 'Base', 'Alíquota', 'Valor', 'Aux 1', 'Aux 2', 'CFOP Replicado'
    ];

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(prevFiles => [...prevFiles, ...Array.from(e.target.files!)]);
        }
    };

    const handleClearFiles = () => {
        setFiles([]);
        setProcessedData(null);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        toast({
            title: "Arquivos e dados limpos",
            description: "A lista de arquivos e os resultados foram limpos.",
        });
    };

    const processFiles = async () => {
        if (files.length === 0) {
            toast({
                variant: "destructive",
                title: "Nenhum arquivo carregado",
                description: "Por favor, carregue pelo menos uma planilha.",
            });
            return;
        }

        setError(null);
        setProcessing(true);
        setProcessedData(null);

        const dfs_to_write: ProcessedData = {};

        try {
            for (const file of files) {
                const sheetName = file.name.replace(/\.[^/.]+$/, "");
                const fileExtension = file.name.split('.').pop()?.toLowerCase();
                const content = await file.arrayBuffer();
                
                let df: any[][] = [];
                if (fileExtension === 'xlsx') {
                    const workbook = XLSX.read(content, { type: 'buffer' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    df = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                } else if (fileExtension === 'csv') {
                    const decoder = new TextDecoder('utf-8');
                    const csvString = decoder.decode(content);
                    const workbook = XLSX.read(csvString, { type: 'string' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    df = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                } else {
                    toast({
                        variant: "destructive",
                        title: "Formato não suportado",
                        description: `Arquivo '${file.name}' ignorado.`
                    });
                    continue;
                }

                // Convert to array of objects with new headers
                let dataAsObjects = df.map(row => {
                    const obj: {[key: string]: any} = {};
                    newHeaders.forEach((header, index) => {
                        obj[header] = row[index];
                    });
                    return obj;
                });

                // Replicate NF and CFOP
                let lastNfNumber: any = null;
                let lastCfop: any = null;
                dataAsObjects.forEach(row => {
                    if (!row['Itens da Nota'] || String(row['Itens da Nota']).trim() === '') {
                        lastNfNumber = row['Desconto'];
                        lastCfop = row['CFOP'];
                        row['CFOP Replicado'] = lastCfop;
                    } else {
                        row['Desconto'] = lastNfNumber;
                        row['CFOP Replicado'] = lastCfop;
                    }
                });

                // Filter rows
                let filteredData = dataAsObjects.filter(row => 
                    row['Itens da Nota'] && 
                    String(row['Itens da Nota']).toUpperCase() !== 'ITENS DA NOTA' &&
                    String(row['Itens da Nota']).toUpperCase() !== 'TOTAL'
                );

                // Add to dfs_to_write
                if (!dfs_to_write[sheetName]) {
                    dfs_to_write[sheetName] = [];
                }
                dfs_to_write[sheetName].push(...filteredData);
            }
            
            setProcessedData(dfs_to_write);
            toast({
                title: "Processamento Concluído",
                description: "Os arquivos foram processados com sucesso. Você pode baixar a planilha consolidada.",
            });

        } catch (err: any) {
            const errorMessage = err.message || "Ocorreu um erro desconhecido.";
            setError(errorMessage);
            toast({
                variant: "destructive",
                title: "Erro no Processamento",
                description: errorMessage,
            });
        } finally {
            setProcessing(false);
        }
    };
    
    const handleDownload = () => {
        if (!processedData) {
             toast({
                variant: "destructive",
                title: "Sem dados",
                description: "Não há dados processados para baixar.",
            });
            return;
        }

        const output_filename = 'planilha_consolidada.xlsx';
        const writer = XLSX.utils.book_new();

        for (const sheetName in processedData) {
            const final_df_data = processedData[sheetName].map(row => {
                const descontoStr = String(row['Desconto'] || '').replace('.', ',');
                const valorItemStr = String(row['Valor do Item'] || '').replace('.', ',');
                row['Chave'] = descontoStr + valorItemStr;
                return row;
            });
            
            const worksheet = XLSX.utils.json_to_sheet(final_df_data);
             if (final_df_data.length > 0) {
                worksheet['!cols'] = Object.keys(final_df_data[0] || {}).map(() => ({ wch: 20 }));
            }
            XLSX.utils.book_append_sheet(writer, worksheet, sheetName);
        }

        XLSX.writeFile(writer, output_filename);
        toast({ title: "Download Iniciado", description: `O arquivo ${output_filename} está sendo baixado.` });
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
                                <DropdownMenuItem asChild>
                                    <Link href="/merger" className="flex items-center gap-2 w-full"><Group />Agrupador de Planilhas</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/sage-itens-nf" className="flex items-center gap-2 w-full"><FileText />Sage - Itens da NF</Link>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="ghost" asChild>
                           <Link href="/history">Histórico</Link>
                        </Button>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                <div className="mx-auto max-w-5xl space-y-8">
                     <Card className="shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <FileText className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Sage - Processador de Itens de NF</CardTitle>
                                    <CardDescription>Carregue suas planilhas para replicar o CFOP e o número da NF nos itens.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/50 p-8 transition-all">
                                <label htmlFor="file-upload" className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-center">
                                    <UploadCloud className="h-12 w-12 text-muted-foreground" />
                                    <p className="mt-4 font-semibold">Clique para carregar as planilhas</p>
                                    <p className="text-sm text-muted-foreground">
                                        Selecione múltiplos arquivos (.xlsx, .csv)
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
                                    accept=".xlsx, .csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                                />
                            </div>

                            {files.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="font-medium">Arquivos Carregados:</h4>
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
                                <Button onClick={processFiles} disabled={processing || files.length === 0} className="flex-grow">
                                    {processing ? <><Loader2 className="animate-spin" /> Processando...</> : <>Processar Arquivos</>}
                                </Button>
                                <Button onClick={handleDownload} disabled={!processedData} className="flex-grow">
                                     <Download /> Baixar Consolidado
                                </Button>
                                <Button onClick={handleClearFiles} variant="destructive" className="flex-shrink-0" disabled={files.length === 0}>
                                <Trash2 /> Limpar Tudo
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {processedData && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Resultados Processados</CardTitle>
                                <CardDescription>Dados após o processamento. Você pode baixar o arquivo consolidado.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {Object.entries(processedData).map(([sheetName, data]) => (
                                    <div key={sheetName} className="mb-8">
                                        <h3 className="text-xl font-semibold mb-4">{sheetName}</h3>
                                        <DataTable columns={getColumns(data)} data={data} />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
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
