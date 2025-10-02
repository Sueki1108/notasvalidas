// src/app/page.tsx
"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { useRouter } from 'next/navigation';
import * as XLSX from "xlsx";
import { Sheet, FileText, UploadCloud, Cpu, BrainCircuit, Trash2, History, Group, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm, type FileList } from "@/components/app/file-upload-form";
import { ResultsDisplay } from "@/components/app/results-display";
import { processUploadedFiles } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import { formatCnpj } from "@/lib/utils";
import type { KeyCheckResult } from "@/app/key-checker/page";

type SpedInfo = {
    companyName: string;
    cnpj: string;
    competence: string;
}

const requiredFiles = [
    "XMLs de Entrada (NFe)",
    "XMLs de Entrada (CTe)",
    "XMLs de Saída",
    "SPED TXT",
    "NF-Stock NFE Operação Não Realizada",
    "NF-Stock NFE Operação Desconhecida",
    "NF-Stock CTE Desacordo de Serviço",
];

// This is a global in-memory cache for files.
if (typeof window !== 'undefined' && !(window as any).__file_cache) {
    (window as any).__file_cache = {};
}
const fileCache: FileList = typeof window !== 'undefined' ? (window as any).__file_cache : {};

export default function Home() {
    const [files, setFiles] = useState<FileList>(fileCache);
    const [processing, setProcessing] = useState(false);
    const [results, setResults] = useState<Record<string, any[]> | null>(null);
    const [keyCheckResults, setKeyCheckResults] = useState<KeyCheckResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const router = useRouter();
    const [spedInfo, setSpedInfo] = useState<SpedInfo | null>(null);

    useEffect(() => {
        try {
            const storedResults = sessionStorage.getItem('processedData');
            if (storedResults) setResults(JSON.parse(storedResults));
            
            const storedKeyCheckResults = sessionStorage.getItem('keyCheckResults');
            if (storedKeyCheckResults) setKeyCheckResults(JSON.parse(storedKeyCheckResults));

            const storedSpedInfo = sessionStorage.getItem('spedInfo');
            if (storedSpedInfo) setSpedInfo(JSON.parse(storedSpedInfo));
            
            setFiles(fileCache);
        } catch (e) {
            console.error("Failed to parse state from sessionStorage", e);
            sessionStorage.clear();
        }
    }, []);

    const updateFileCache = (newFiles: FileList) => {
        Object.keys(newFiles).forEach(key => {
            if (newFiles[key] && newFiles[key]!.length > 0) fileCache[key] = newFiles[key];
            else delete fileCache[key];
        });
        Object.keys(fileCache).forEach(key => {
            if (!newFiles[key]) delete fileCache[key];
        });
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        const fileName = e.target.name;
        if (selectedFiles && selectedFiles.length > 0) {
            const currentFiles = files[fileName] || [];
            const newFiles = { ...files, [fileName]: [...currentFiles, ...Array.from(selectedFiles)] };
            setFiles(newFiles);
            updateFileCache(newFiles);
        }
    };

    const handleClearFile = (fileName: string) => {
        const newFiles = { ...files };
        delete newFiles[fileName];
        setFiles(newFiles);
        updateFileCache(newFiles);
        const input = document.querySelector(`input[name="${fileName}"]`) as HTMLInputElement;
        if (input) input.value = "";
    };

    const handleSubmit = async () => {
        setError(null);
        if (!Object.values(files).some(fileList => fileList && fileList.length > 0)) {
            toast({ variant: "destructive", title: "Nenhum arquivo carregado", description: "Por favor, carregue pelo menos um arquivo." });
            return;
        }

        setProcessing(true);
        try {
            const formData = new FormData();
            for (const name in files) {
                const fileList = files[name];
                if (fileList) {
                    for (const file of fileList) {
                        formData.append(name, file);
                    }
                }
            }

            const resultData = await processUploadedFiles(formData);
            if (resultData.error) throw new Error(resultData.error);

            sessionStorage.setItem('processedData', JSON.stringify(resultData.data || null));
            sessionStorage.setItem('keyCheckResults', JSON.stringify(resultData.keyCheckResults || null));
            sessionStorage.setItem('spedInfo', JSON.stringify(resultData.spedInfo || null));

            setResults(resultData.data || null);
            setKeyCheckResults(resultData.keyCheckResults || null);
            setSpedInfo(resultData.spedInfo || null);

            toast({ title: "Processamento Concluído", description: "Os arquivos foram processados com sucesso." });
        } catch (err: any) {
            setError(err.message || "Ocorreu um erro desconhecido.");
            setResults(null);
            setKeyCheckResults(null);
            toast({ variant: "destructive", title: "Erro no Processamento", description: err.message });
        } finally {
            setProcessing(false);
        }
    };

    const handleClearData = () => {
        setFiles({});
        setResults(null);
        setKeyCheckResults(null);
        setError(null);
        setSpedInfo(null);
        sessionStorage.clear();
        for (const key in fileCache) delete fileCache[key];
        const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
        inputs.forEach(input => input.value = "");
        toast({ title: "Dados Limpos", description: "Todos os arquivos e resultados foram removidos." });
    };

    const handleDownload = () => {
        if (!results) return;
        try {
            const workbook = XLSX.utils.book_new();
            const sheetNameMap: { [key: string]: string } = {
                "NF-Stock NFE Operação Não Realizada": "NFE Op Nao Realizada",
                "NF-Stock NFE Operação Desconhecida": "NFE Op Desconhecida",
                "NF-Stock CTE Desacordo de Serviço": "CTE Desacordo Servico",
                "Notas Válidas": "Notas Validas",
                "Emissão Própria": "Emissao Propria",
                "Notas Canceladas": "Notas Canceladas",
                "Itens Válidos": "Itens Validos",
                "Imobilizados": "Imobilizados",
                "Chaves Válidas": "Chaves Validas",
            };
            const orderedSheetNames = ["Notas Válidas", "Itens Válidos", "Chaves Válidas", ...Object.keys(results).filter(name => !["Notas Válidas", "Itens Válidos", "Chaves Válidas"].includes(name))];
            orderedSheetNames.forEach(sheetName => {
                if (results[sheetName] && results[sheetName].length > 0) {
                    const worksheet = XLSX.utils.json_to_sheet(results[sheetName]);
                    worksheet['!cols'] = Object.keys(results[sheetName][0] || {}).map(() => ({ wch: 20 }));
                    const excelSheetName = sheetNameMap[sheetName] || sheetName;
                    XLSX.utils.book_append_sheet(workbook, worksheet, excelSheetName);
                }
            });
            XLSX.writeFile(workbook, "Planilhas_Processadas.xlsx");
            toast({ title: "Download Iniciado", description: "O arquivo Excel está sendo baixado." });
        } catch (err: any) {
            setError("Falha ao gerar o arquivo Excel.");
            toast({ variant: "destructive", title: "Erro no Download", description: "Não foi possível gerar o arquivo Excel." });
        }
    };
    
    const hasKeyCheckResults = keyCheckResults && (keyCheckResults.keysInTxtNotInSheet.length > 0 || keyCheckResults.keysNotFoundInTxt.length > 0);
    const isProcessButtonDisabled = processing || Object.keys(files).length === 0;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2">
                            <Sheet className="h-6 w-6 text-primary" />
                            {spedInfo ? (
                                <h1 className="text-sm font-bold md:text-xl font-headline">
                                    {spedInfo.companyName} - {formatCnpj(spedInfo.cnpj)}
                                </h1>
                            ) : (
                                <h1 className="text-xl font-bold font-headline">Excel Workflow Automator</h1>
                            )}
                        </Link>
                    </div>
                    <nav className="flex items-center gap-4">
                        <Button variant="ghost" asChild>
                            <Link href="/merger" className="flex items-center gap-2"><Group />Agrupador</Link>
                        </Button>
                         <Button variant="ghost" asChild>
                           <Link href="/key-checker">Verificador de Chaves</Link>
                        </Button>
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
                                <UploadCloud className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">1. Carregar Arquivos</CardTitle>
                                    <CardDescription>Faça o upload dos arquivos XML, do SPED TXT e das planilhas de exceção.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FileUploadForm
                                requiredFiles={requiredFiles}
                                files={files}
                                onFileChange={handleFileChange}
                                onClearFile={handleClearFile}
                            />
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Cpu className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">2. Processar</CardTitle>
                                    <CardDescription>Inicie a automação e o processamento dos dados dos arquivos carregados.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2 sm:flex-row">
                            <Button onClick={handleSubmit} disabled={isProcessButtonDisabled} className="flex-grow">
                                {processing ? "Processando..." : "Processar Arquivos"}
                            </Button>
                            <Button onClick={handleClearData} variant="destructive" className="flex-shrink-0">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Limpar Dados
                            </Button>
                        </CardContent>
                    </Card>

                    {processing && (
                        <Card className="shadow-lg">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <BrainCircuit className="h-8 w-8 text-primary animate-pulse" />
                                    <div>
                                        <CardTitle className="font-headline text-2xl">Processando...</CardTitle>
                                        <CardDescription>Aguarde enquanto os dados são analisados.</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                               <Skeleton className="h-8 w-full" />
                               <Skeleton className="h-32 w-full" />
                            </CardContent>
                        </Card>
                    )}

                    {error && (
                        <Alert variant="destructive">
                            <FileText className="h-4 w-4" />
                            <AlertTitle>Erro</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {results && (
                        <Card className="shadow-lg">
                            <CardHeader>
                                 <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-3">
                                        <FileText className="h-8 w-8 text-primary" />
                                        <div>
                                            <CardTitle className="font-headline text-2xl">3. Dados Processados</CardTitle>
                                            <CardDescription>Visualize e baixe os dados processados.</CardDescription>
                                        </div>
                                    </div>
                                     <div className="flex gap-2">
                                        {hasKeyCheckResults && (
                                            <Button asChild variant="outline">
                                                <Link href="/key-checker">
                                                    <KeyRound className="mr-2 h-4 w-4" />
                                                    Verificar Divergências
                                                </Link>
                                            </Button>
                                        )}
                                        <Button onClick={handleDownload} disabled={!results}>
                                            Baixar Planilha (.xlsx)
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-8">
                                <ResultsDisplay results={results} />
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
