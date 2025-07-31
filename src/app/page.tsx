"use client";

import { useState, useTransition } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from 'next/navigation';
import * as XLSX from "xlsx";
import { Sheet, FileText, UploadCloud, Cpu, BrainCircuit, FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm, type FileList } from "@/components/app/file-upload-form";
import { ResultsDisplay } from "@/components/app/results-display";
import { processUploadedFiles } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";

const requiredFiles = [
    "NF-Stock NFE",
    "NF-Stock CTE",
    "NF-Stock Itens",
    "NF-Stock NFE Operação Não Realizada",
    "NF-Stock NFE Operação Desconhecida",
    "NF-Stock CTE Desacordo de Serviço"
];

export default function Home() {
    const [files, setFiles] = useState<FileList>({});
    const [textFile, setTextFile] = useState<File | null>(null);
    const [processing, setProcessing] = useState(false);
    const [results, setResults] = useState<Record<string, any[]> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const router = useRouter();
    const [isNavigating, startTransition] = useTransition();

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        const fileName = e.target.name;
        if (selectedFiles && selectedFiles.length > 0) {
            setFiles(prev => ({ ...prev, [fileName]: Array.from(selectedFiles) }));
        }
    };

    const handleTextFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setTextFile(file || null);
    };

    const handleClearFile = (fileName: string) => {
        setFiles(prev => {
            const newFiles = {...prev};
            delete newFiles[fileName];
            const input = document.querySelector(`input[name="${fileName}"]`) as HTMLInputElement;
            if (input) input.value = "";
            return newFiles;
        });
    };

    const handleSubmit = async () => {
        setError(null);
        setResults(null);
        
        if (Object.keys(files).length === 0) {
            toast({
                variant: "destructive",
                title: "Nenhum arquivo carregado",
                description: "Por favor, carregue pelo menos uma planilha para processar.",
            });
            return;
        }

        const formData = new FormData();
        for (const name in files) {
            const fileList = files[name];
            if (fileList) {
                for (const file of fileList) {
                    formData.append(name, file as Blob, file.name);
                }
            }
        }
        
        if (textFile) {
            formData.append("textFile", textFile, textFile.name);
        }

        setProcessing(true);
        try {
            const resultData = await processUploadedFiles(formData);

            if (resultData.error) {
              throw new Error(resultData.error);
            }

            if (resultData.data) {
                setResults(resultData.data);
                sessionStorage.setItem('processedData', JSON.stringify(resultData.data));
            }
            if (resultData.keyCheckResults) {
                sessionStorage.setItem('keyCheckResults', JSON.stringify(resultData.keyCheckResults));
            }

            toast({
                title: "Processamento Concluído",
                description: "Os arquivos foram processados com sucesso.",
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
    
    const handleNavigateToKeyChecker = () => {
        if (!sessionStorage.getItem('keyCheckResults')) {
            toast({
                variant: "destructive",
                title: "Dados Insuficientes",
                description: "Processe os arquivos junto com um arquivo de texto para ver os resultados.",
            });
            return;
        }
        startTransition(() => {
            router.push('/key-checker');
        });
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

            const orderedSheetNames = [
                "Notas Válidas", "Itens Válidos", "Chaves Válidas",
                ...Object.keys(results).filter(name => !["Notas Válidas", "Itens Válidos", "Chaves Válidas"].includes(name))
            ];
            
            orderedSheetNames.forEach(sheetName => {
                if (results[sheetName] && results[sheetName].length > 0) {
                    const worksheet = XLSX.utils.json_to_sheet(results[sheetName]);
                    // Basic autofit - set widths
                    const cols = Object.keys(results[sheetName][0] || {});
                    worksheet['!cols'] = cols.map(() => ({ wch: 20 }));
                    
                    const excelSheetName = sheetNameMap[sheetName] || sheetName;
                    XLSX.utils.book_append_sheet(workbook, worksheet, excelSheetName);
                }
            });
    
            XLSX.writeFile(workbook, "Planilhas_Processadas.xlsx");
            toast({
                title: "Download Iniciado",
                description: "O arquivo Planilhas_Processadas.xlsx está sendo baixado.",
            });
        } catch(err: any) {
            setError("Falha ao gerar o arquivo Excel para download.");
            toast({
                variant: "destructive",
                title: "Erro no Download",
                description: "Não foi possível gerar o arquivo Excel.",
            });
        }
    };

    const isProcessButtonDisabled = processing || Object.keys(files).length === 0;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                         <a href="/" className="flex items-center gap-2">
                            <Sheet className="h-6 w-6 text-primary" />
                            <h1 className="text-xl font-bold font-headline">Excel Workflow Automator</h1>
                        </a>
                    </div>
                     <nav className="flex items-center gap-4">
                         <Button variant="ghost" onClick={handleNavigateToKeyChecker} disabled={isNavigating}>
                            {isNavigating ? "Navegando..." : "Verificador de Chaves"}
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
                                    <CardDescription>Faça o upload das planilhas e do arquivo de texto para o processamento.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FileUploadForm
                                requiredFiles={requiredFiles}
                                files={files}
                                onFileChange={handleFileChange}
                                onClearFile={handleClearFile}
                                isOptional={true}
                            />
                             <div className="border-t pt-6">
                                <label htmlFor="text-upload" className="font-medium text-lg flex items-center gap-2">
                                  <FileUp className="h-5 w-5" />
                                  Arquivo de Texto para Comparação (Opcional)
                                </label>
                                <p className="text-sm text-muted-foreground mb-2">Carregue um arquivo .txt para comparar com as chaves válidas geradas.</p>
                                <Input id="text-upload" type="file" onChange={handleTextFileChange} accept=".txt" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg">
                        <CardHeader>
                             <div className="flex items-center gap-3">
                                <Cpu className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">2. Processar Dados</CardTitle>
                                    <CardDescription>Após o upload, clique no botão para iniciar a automação e a verificação das chaves.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Button onClick={handleSubmit} disabled={isProcessButtonDisabled} className="w-full">
                                {processing ? "Processando..." : "Processar Arquivos"}
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
                                        <CardDescription>Aguarde enquanto a mágica acontece. Os dados estão sendo analisados e transformados.</CardDescription>
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
                                            <CardTitle className="font-headline text-2xl">3. Resultados e Download</CardTitle>
                                            <CardDescription>Visualize os dados processados e baixe a planilha finalizada.</CardDescription>
                                        </div>
                                    </div>
                                    <Button onClick={handleDownload} disabled={!results}>
                                        Baixar Planilha (.xlsx)
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
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
