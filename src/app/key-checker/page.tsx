// src/app/key-checker/page.tsx
"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KeyRound, FileUp, FileText, Loader2, Copy, CheckCircle, XCircle, Download, Ban, Circle, Sheet } from "lucide-react";
import { KeyResultsDisplay } from "@/components/app/key-results-display";

export type KeyCheckResult = {
    keysNotFoundInTxt: string[];
    keysInTxtNotInSheet: string[];
};

export default function KeyCheckerPage() {
    const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null);
    const [textFile, setTextFile] = useState<File | null>(null);
    const [processing, setProcessing] = useState(false);
    const [results, setResults] = useState<KeyCheckResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const handleSpreadsheetChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setSpreadsheetFile(file || null);
    };

    const handleTextFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setTextFile(file || null);
    };

    const handleSubmit = async () => {
        if (!spreadsheetFile || !textFile) {
            toast({
                variant: "destructive",
                title: "Arquivos Faltando",
                description: "Por favor, carregue a planilha e o arquivo de texto.",
            });
            return;
        }

        setError(null);
        setResults(null);
        setProcessing(true);

        try {
            // 1. Read Spreadsheet
            const spreadsheetData = await spreadsheetFile.arrayBuffer();
            const workbook = XLSX.read(spreadsheetData);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });

            if (json.length === 0 || json[0].length === 0) {
                 throw new Error("A planilha está vazia ou não possui colunas.");
            }
            const spreadsheetKeys = new Set(json.map(row => String(row[0]).trim()).filter(key => key));

            // 2. Read Text File
            const textContent = await textFile.text();
            const normalizedText = textContent.replace(/\r\n/g, '\n').replace(/\r/g, '');
            const keyPattern = /\b\d{44}\b/g;
            const keysInTxt = new Set(normalizedText.match(keyPattern) || []);

            // 3. Compare Keys
            const keysNotFoundInTxt = [...spreadsheetKeys].filter(key => !keysInTxt.has(key));
            const keysInTxtNotInSheet = [...keysInTxt].filter(key => !spreadsheetKeys.has(key));

            setResults({ keysNotFoundInTxt, keysInTxtNotInSheet });
             toast({
                title: "Verificação Concluída",
                description: "A comparação entre a planilha e o arquivo de texto foi finalizada.",
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
                        <Button variant="ghost" asChild>
                           <a href="/key-checker">Verificador de Chaves</a>
                        </Button>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                 <div className="mx-auto max-w-5xl space-y-8">
                    <Card className="shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <FileUp className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">1. Carregar Arquivos</CardTitle>
                                    <CardDescription>Faça o upload da planilha e do arquivo de texto para comparação.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div>
                             <label htmlFor="spreadsheet-upload" className="font-medium">Planilha (.xlsx, .xls, .csv)</label>
                             <Input id="spreadsheet-upload" type="file" onChange={handleSpreadsheetChange} accept=".xlsx,.xls,.csv" className="mt-2" />
                           </div>
                            <div>
                             <label htmlFor="text-upload" className="font-medium">Arquivo de Texto (.txt)</label>
                             <Input id="text-upload" type="file" onChange={handleTextFileChange} accept=".txt" className="mt-2" />
                           </div>
                        </CardContent>
                    </Card>

                     <Card className="shadow-lg">
                        <CardHeader>
                             <div className="flex items-center gap-3">
                                <KeyRound className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">2. Comparar Chaves</CardTitle>
                                    <CardDescription>Clique para iniciar a verificação das chaves entre os arquivos.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                             <Button onClick={handleSubmit} disabled={processing || !spreadsheetFile || !textFile} className="w-full">
                                {processing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Processando...
                                    </>
                                ) : "Comparar Arquivos"}
                            </Button>
                        </CardContent>
                    </Card>

                    {error && (
                        <Alert variant="destructive">
                            <FileText className="h-4 w-4" />
                            <AlertTitle>Erro</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {results && <KeyResultsDisplay results={results} />}

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
