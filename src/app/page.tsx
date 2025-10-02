// src/app/page.tsx
"use client";

import { useState, useEffect, ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { Sheet, FileText, UploadCloud, Cpu, BrainCircuit, Trash2, History, Group, AlertTriangle, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm, type FileList } from "@/components/app/file-upload-form";
import { ResultsDisplay } from "@/components/app/results-display";
import { KeyResultsDisplay } from "@/components/app/key-results-display";
import { validateWithSped, type KeyCheckResult, type SpedInfo } from "@/app/actions";
import { processDataFrames } from "@/lib/excel-processor";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import { formatCnpj } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


const initialFilesState: FileList = {
    "XMLs de Entrada (NFe)": null,
    "XMLs de Entrada (CTe)": null,
    "XMLs de Saída": null,
    "NF-Stock NFE Operação Não Realizada": null,
    "NF-Stock NFE Operação Desconhecida": null,
    "NF-Stock CTE Desacordo de Serviço": null,
};

// This is a global in-memory cache for files.
if (typeof window !== 'undefined' && !(window as any).__file_cache) {
    (window as any).__file_cache = {};
}
const fileCache: FileList = typeof window !== 'undefined' ? (window as any).__file_cache : {};

type DataFrames = { [key: string]: any[] };

const extractNfeDataFromXml = (xmlContent: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
    const errorNode = xmlDoc.querySelector("parsererror");
    if (errorNode) {
      console.error("Error parsing XML:", errorNode.textContent);
      return null;
    }

    const getValue = (tag: string, context: Document | Element = xmlDoc) => context.getElementsByTagName(tag)[0]?.textContent || '';

    // Check if it's a cancellation event XML
    const procEventoNFe = xmlDoc.getElementsByTagName('procEventoNFe')[0];
    if (procEventoNFe) {
        const chNFe = procEventoNFe.getElementsByTagName('chNFe')[0]?.textContent || '';
        const tpEvento = procEventoNFe.getElementsByTagName('tpEvento')[0]?.textContent || '';
        const cStatEvento = procEventoNFe.getElementsByTagName('cStat')[0]?.textContent || '';

        // 110111 is cancellation event, 135 is success status for the event
        if (tpEvento === '110111' && (cStatEvento === '135' || cStatEvento === '101')) {
            return {
                nota: {
                    'Chave de acesso': `NFe${chNFe}`,
                    'Status': 'Cancelada (Evento)',
                },
                itens: []
            };
        }
        return null; // Not a relevant event
    }

    const ide = xmlDoc.getElementsByTagName('ide')[0];
    const emit = xmlDoc.getElementsByTagName('emit')[0];
    const dest = xmlDoc.getElementsByTagName('dest')[0];
    const total = xmlDoc.getElementsByTagName('ICMSTot')[0];
    const protNFe = xmlDoc.getElementsByTagName('protNFe')[0];

    if (!ide || !emit || !total ) return null;
    
    const infProt = protNFe ? protNFe.getElementsByTagName('infProt')[0] : null;
    const chNFe = infProt ? getValue('chNFe', infProt) : xmlDoc.getElementsByTagName('infNFe')[0]?.getAttribute('Id')?.replace('NFe', '') || '';
    const cStat = infProt ? getValue('cStat', infProt) : '0';


    const isSaida = getValue('tpNF', ide) === '1';

    const nota = {
        'Chave de acesso': `NFe${chNFe}`,
        'Número': getValue('nNF', ide),
        'Data de Emissão': getValue('dhEmi', ide),
        'Valor': getValue('vNF', total),
        'Status': parseInt(cStat) === 100 ? 'Autorizadas' : (parseInt(cStat) === 101 ? 'Canceladas' : `Status ${cStat}`),
        'Emitente CPF/CNPJ': getValue('CNPJ', emit) || getValue('CPF', emit),
        'Emitente': getValue('xNome', emit),
        'Destinatário CPF/CNPJ': dest ? (getValue('CNPJ', dest) || getValue('CPF', dest)) : '',
        'Destinatário': dest ? getValue('xNome', dest) : '',
        'Fornecedor/Cliente': isSaida ? (getValue('xNome', dest)) : (getValue('xNome', emit)),
    };


    const itens: any[] = [];
    const detElements = Array.from(xmlDoc.getElementsByTagName('det'));

    for (const det of detElements) {
        const prod = det.getElementsByTagName('prod')[0];
        if (prod) {
            itens.push({
                'Chave de acesso': `NFe${chNFe}`,
                'Número': getValue('nNF', ide),
                'CPF/CNPJ': isSaida ? (getValue('CNPJ', dest) || getValue('CPF', dest)) : (getValue('CNPJ', emit) || getValue('CPF', emit)),
                'CFOP': prod.getElementsByTagName('CFOP')[0]?.textContent || '',
                'Código': prod.getElementsByTagName('cProd')[0]?.textContent || '',
                'Descrição': prod.getElementsByTagName('xProd')[0]?.textContent || '',
                'NCM': prod.getElementsByTagName('NCM')[0]?.textContent || '',
                'Quantidade': parseFloat(prod.getElementsByTagName('qCom')[0]?.textContent || '0'),
                'Valor Unitário': parseFloat(prod.getElementsByTagName('vUnCom')[0]?.textContent || '0'),
                'Valor Total': parseFloat(prod.getElementsByTagName('vProd')[0]?.textContent || '0'),
            });
        }
    }

    return { nota, itens };
}

const extractCteDataFromXml = (xmlContent: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
    const errorNode = xmlDoc.querySelector("parsererror");
    if (errorNode) {
      console.error("Error parsing XML:", errorNode.textContent);
      return null;
    }


    const getValue = (tag: string, context: Document | Element = xmlDoc) => context.getElementsByTagName(tag)[0]?.textContent || '';

    const ide = xmlDoc.getElementsByTagName('ide')[0];
    const vPrest = xmlDoc.getElementsByTagName('vPrest')[0];
    const protCTe = xmlDoc.getElementsByTagName('protCTe')[0];
    const toma = xmlDoc.getElementsByTagName('toma')[0];

    if(!ide || !vPrest || !protCTe) return null;

    const chCTe = protCTe.getElementsByTagName('chCTe')[0]?.textContent || '';
    const cStat = protCTe.getElementsByTagName('cStat')[0]?.textContent || '';
    const tomadorName = toma ? getValue('xNome', toma) : '';

    const nota = {
        'Chave de acesso': `CTe${chCTe}`,
        'Número': getValue('nCT', ide),
        'Data de Emissão': getValue('dhEmi', ide),
        'Valor': parseFloat(getValue('vTPrest', vPrest)),
        'Status': parseInt(cStat) === 100 ? 'Autorizadas' : `Status ${cStat}`,
        'Tomador CPF/CNPJ': toma ? (getValue('CNPJ', toma) || getValue('CPF', toma)) : '',
        'Tomador': tomadorName,
        'Fornecedor/Cliente': tomadorName,
    };

    return { nota };
}

export default function Home() {
    const [activeTab, setActiveTab] = useState("process");
    const [files, setFiles] = useState<FileList>(fileCache);
    const [spedFile, setSpedFile] = useState<File | null>(null);
    const [processing, setProcessing] = useState(false);
    const [validating, setValidating] = useState(false);
    const [results, setResults] = useState<Record<string, any[]> | null>(null);
    const [keyCheckResults, setKeyCheckResults] = useState<KeyCheckResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const [spedInfo, setSpedInfo] = useState<SpedInfo | null>(null);

     const requiredFilesForStep1 = [
        "XMLs de Entrada (NFe)",
        "XMLs de Entrada (CTe)",
        "XMLs de Saída",
        "NF-Stock NFE Operação Não Realizada",
        "NF-Stock NFE Operação Desconhecida",
        "NF-Stock CTE Desacordo de Serviço",
    ];

    useEffect(() => {
        try {
            const storedResults = sessionStorage.getItem('processedData');
            if (storedResults) setResults(JSON.parse(storedResults));

            const storedKeyCheckResults = sessionStorage.getItem('keyCheckResults');
            if (storedKeyCheckResults) setKeyCheckResults(JSON.parse(storedKeyCheckResults));

            const storedSpedInfo = sessionStorage.getItem('spedInfo');
            if (storedSpedInfo) setSpedInfo(JSON.parse(storedSpedInfo));

            const storedTab = sessionStorage.getItem('activeTab');
            if (storedTab) setActiveTab(storedTab);

            setFiles(fileCache);
        } catch (e) {
            console.error("Failed to parse state from sessionStorage", e);
            handleClearData(true);
        }
    }, []);

     const handleTabChange = (value: string) => {
        setActiveTab(value);
        sessionStorage.setItem('activeTab', value);
    };

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
            if (fileName === 'SPED TXT') {
                setSpedFile(selectedFiles[0]);
            } else {
                const currentFiles = files[fileName] || [];
                const newFiles = { ...files, [fileName]: [...currentFiles, ...Array.from(selectedFiles)] };
                setFiles(newFiles);
                updateFileCache(newFiles);
            }
        }
    };

    const handleClearFile = (fileName: string) => {
        if (fileName === 'SPED TXT') {
            setSpedFile(null);
            const input = document.querySelector(`input[name="SPED TXT"]`) as HTMLInputElement;
            if (input) input.value = "";
        } else {
            const newFiles = { ...files };
            delete newFiles[fileName];
            setFiles(newFiles);
            updateFileCache(newFiles);
            const input = document.querySelector(`input[name="${fileName}"]`) as HTMLInputElement;
            if (input) input.value = "";
        }
    };

    const handleProcessPrimaryFiles = async () => {
        setError(null);
        setKeyCheckResults(null);
        setResults(null);
        if (!Object.values(files).some(fileList => fileList && fileList.length > 0)) {
            toast({ variant: "destructive", title: "Nenhum arquivo carregado", description: "Por favor, carregue pelo menos um arquivo XML ou de exceção." });
            return;
        }

        setProcessing(true);
        try {
            const dataFrames: DataFrames = {};
            const nfeEntrada: any[] = [];
            const nfeItensEntrada: any[] = [];
            const cteEntrada: any[] = [];
            const nfeSaida: any[] = [];
            const nfeItensSaida: any[] = [];
            const canceledKeys = new Set<string>();

            const processXmls = async (fileList: File[], type: 'NFe-Entrada' | 'CTe-Entrada' | 'Saida') => {
                 for (const file of fileList) {
                    const fileContent = await file.text();
                    if (type === 'CTe-Entrada') {
                        const xmlData = extractCteDataFromXml(fileContent);
                        if (xmlData) cteEntrada.push(xmlData.nota);
                    } else {
                        const xmlData = extractNfeDataFromXml(fileContent);
                        if (xmlData) {
                             if (xmlData.nota['Status']?.includes('Cancelada')) {
                                canceledKeys.add(xmlData.nota['Chave de acesso']);
                            }
                            if (type === 'NFe-Entrada') {
                                nfeEntrada.push(xmlData.nota);
                                nfeItensEntrada.push(...xmlData.itens);
                            } else {
                                nfeSaida.push(xmlData.nota);
                                nfeItensSaida.push(...xmlData.itens);
                            }
                        }
                    }
                }
            };

            if (files["XMLs de Entrada (NFe)"]) await processXmls(files["XMLs de Entrada (NFe)"]!, 'NFe-Entrada');
            if (files["XMLs de Entrada (CTe)"]) await processXmls(files["XMLs de Entrada (CTe)"]!, 'CTe-Entrada');
            if (files["XMLs de Saída"]) await processXmls(files["XMLs de Saída"]!, 'Saida');

            dataFrames['NF-Stock NFE'] = nfeEntrada;
            dataFrames['NF-Stock CTE'] = cteEntrada;
            dataFrames['NF-Stock Itens'] = nfeItensEntrada;
            dataFrames['NF-Stock Emitidas'] = nfeSaida;
            dataFrames['NF-Stock Emitidas Itens'] = nfeItensSaida;

            for (const category in files) {
                const fileList = files[category];
                if (!fileList || category.includes('XML')) continue;

                for (const file of fileList) {
                    if (file.name.toLowerCase().endsWith('.xlsx')) {
                         const sheetName = category;
                        if (!dataFrames[sheetName]) dataFrames[sheetName] = [];
                        const buffer = await file.arrayBuffer();
                        const workbook = XLSX.read(buffer, { type: 'buffer' });
                        for (const wsName of workbook.SheetNames) {
                          const worksheet = workbook.Sheets[wsName];
                          const jsonData = XLSX.utils.sheet_to_json(worksheet);
                          dataFrames[sheetName].push(...jsonData);
                        }
                    }
                }
            }

            const processedData = processDataFrames(dataFrames, canceledKeys);

            sessionStorage.setItem('processedData', JSON.stringify(processedData));
            setResults(processedData);
            toast({ title: "Processamento Concluído", description: "Os arquivos foram processados. Vá para a aba de Validação SPED." });
             handleTabChange('validate');
        } catch (err: any) {
            setError(err.message || "Ocorreu um erro desconhecido.");
            setResults(null);
            toast({ variant: "destructive", title: "Erro no Processamento", description: err.message });
        } finally {
            setProcessing(false);
        }
    };

    async function handleValidateWithSped() {
        if (!spedFile) {
            toast({ variant: "destructive", title: "Arquivo SPED Ausente", description: "Por favor, carregue o arquivo SPED TXT." });
            return;
        }
        if (!results) {
             toast({ variant: "destructive", title: "Dados não processados", description: "Processe os arquivos na aba 'Processamento Principal' primeiro." });
            return;
        }

        setError(null);
        setValidating(true);
        try {
            const spedFileContent = await spedFile.text();
            // Pass all notes (valid entries and exits) to the validation function
            const allNotes = [...(results["Notas Válidas"] || []), ...(results["NF-Stock Emitidas"] || [])];
            const resultData = await validateWithSped(results, spedFileContent, allNotes);

            if (resultData.error) throw new Error(resultData.error);

            sessionStorage.setItem('keyCheckResults', JSON.stringify(resultData.keyCheckResults || null));
            sessionStorage.setItem('spedInfo', JSON.stringify(resultData.spedInfo || null));
            setKeyCheckResults(resultData.keyCheckResults || null);
            setSpedInfo(resultData.spedInfo || null);
            toast({ title: "Validação SPED Concluída", description: "A verificação das chaves foi finalizada." });
        } catch(err: any) {
             setError(err.message || "Ocorreu um erro desconhecido na validação.");
             setKeyCheckResults(null);
             setSpedInfo(null);
             toast({ variant: "destructive", title: "Erro na Validação SPED", description: err.message });
        } finally {
            setValidating(false);
        }
    };


    const handleClearData = (isInternalCall = false) => {
        setFiles(initialFilesState);
        setSpedFile(null);
        setResults(null);
        setKeyCheckResults(null);
        setError(null);
        setSpedInfo(null);
        setActiveTab("process");
        sessionStorage.clear();
        for (const key in fileCache) delete fileCache[key];
        const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
        inputs.forEach(input => input.value = "");
        if (!isInternalCall) {
            toast({ title: "Dados Limpos", description: "Todos os arquivos e resultados foram removidos." });
        }
    };

    const handleDownload = () => {
        if (!results) return;
        try {
            const workbook = XLSX.utils.book_new();
            const sheetNameMap: { [key: string]: string } = {
                "NF-Stock NFE Operação Não Realizada": "NFE Op Nao Realizada",
                "NF-Stock NFE Operação Desconhecida": "NFE Op Desconhecida",
                "NF-Stock CTE Desacordo de Serviço": "CTE Desacordo Servico",
                "NF-Stock Emitidas": "NF Emitidas",
                "Notas Válidas": "Notas Validas",
                "Emissão Própria": "Emissao Propria",
                "Notas Canceladas": "Notas Canceladas",
                "Itens Válidos": "Itens Validos",
                "Itens de Saída": "Itens de Saida",
                "Imobilizados": "Imobilizados",
                "Chaves Válidas": "Chaves Validas",
            };
            const orderedSheetNames = [
                "Notas Válidas", "Itens Válidos", "Emissão Própria", "NF-Stock Emitidas", "Itens de Saída", "Chaves Válidas", "Imobilizados", "Notas Canceladas",
                "NF-Stock NFE Operação Não Realizada", "NF-Stock NFE Operação Desconhecida", "NF-Stock CTE Desacordo de Serviço"
            ].filter(name => results[name] && results[name].length > 0);

            orderedSheetNames.forEach(sheetName => {
                const worksheet = XLSX.utils.json_to_sheet(results[sheetName]);
                worksheet['!cols'] = Object.keys(results[sheetName][0] || {}).map(() => ({ wch: 20 }));
                const excelSheetName = sheetNameMap[sheetName] || sheetName;
                XLSX.utils.book_append_sheet(workbook, worksheet, excelSheetName);
            });

            XLSX.writeFile(workbook, "Planilhas_Processadas.xlsx");
            toast({ title: "Download Iniciado", description: "O arquivo Excel está sendo baixado." });
        } catch (err: any) {
            setError("Falha ao gerar o arquivo Excel.");
            toast({ variant: "destructive", title: "Erro no Download", description: "Não foi possível gerar o arquivo Excel." });
        }
    };

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
                            <Link href="/history">Histórico</Link>
                        </Button>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                <div className="mx-auto max-w-7xl space-y-8">
                     <div className="flex justify-between items-center">
                        <h2 className="text-3xl font-bold font-headline text-primary flex items-center gap-2">
                            Fluxo de Conferência
                        </h2>
                        <Button onClick={() => handleClearData()} variant="destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Limpar Tudo e Recomeçar
                        </Button>
                    </div>

                    <Tabs value={activeTab} onValueChange={handleTabChange}>
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="process">1. Processamento Principal</TabsTrigger>
                            <TabsTrigger value="validate" disabled={!results}>2. Validação SPED</TabsTrigger>
                        </TabsList>
                        <TabsContent value="process" className="mt-6">
                            <Card className="shadow-lg">
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <UploadCloud className="h-8 w-8 text-primary" />
                                        <div>
                                            <CardTitle className="font-headline text-2xl">Carregar XMLs e Exceções</CardTitle>
                                            <CardDescription>Faça o upload dos arquivos XML e das planilhas de exceção.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <FileUploadForm
                                        requiredFiles={requiredFilesForStep1}
                                        files={files}
                                        onFileChange={handleFileChange}
                                        onClearFile={handleClearFile}
                                        disabled={!!results}
                                    />
                                    {!results && (
                                        <Button onClick={handleProcessPrimaryFiles} disabled={processing} className="w-full">
                                            {processing ? "Processando..." : "Processar Arquivos"}
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>

                             {processing && (
                                <Card className="shadow-lg mt-8">
                                    <CardHeader>
                                        <div className="flex items-center gap-3">
                                            <BrainCircuit className="h-8 w-8 text-primary animate-pulse" />
                                            <div>
                                                <CardTitle className="font-headline text-2xl">Processando Arquivos...</CardTitle>
                                                <CardDescription>Aguarde enquanto os dados primários são analisados.</CardDescription>
                                            </div>
                                        </div>
                                    </Header>
                                    <CardContent className="space-y-4">
                                       <Skeleton className="h-8 w-full" />
                                       <Skeleton className="h-32 w-full" />
                                    </CardContent>
                                </Card>
                            )}

                             {error && (
                                <Alert variant="destructive" className="mt-8">
                                    <FileText className="h-4 w-4" />
                                    <AlertTitle>Erro</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            {results && (
                                <Card className="shadow-lg mt-8">
                                    <CardHeader>
                                        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-3">
                                                <FileText className="h-8 w-8 text-primary" />
                                                <div>
                                                    <CardTitle className="font-headline text-2xl">Resultados do Processamento</CardTitle>
                                                    <CardDescription>Visualize e baixe os dados processados.</CardDescription>
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
                        </TabsContent>
                        <TabsContent value="validate" className="mt-6">
                            <Card className="shadow-lg">
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <KeyRound className="h-8 w-8 text-primary" />
                                        <div>
                                            <CardTitle className="font-headline text-2xl">Validar com SPED</CardTitle>
                                            <CardDescription>Carregue o arquivo SPED TXT para comparar com os dados processados.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                   <FileUploadForm
                                        requiredFiles={["SPED TXT"]}
                                        files={{ "SPED TXT": spedFile ? [spedFile] : null }}
                                        onFileChange={handleFileChange}
                                        onClearFile={handleClearFile}
                                    />
                                    <Button onClick={handleValidateWithSped} disabled={validating || !spedFile} className="w-full">
                                        {validating ? "Validando..." : "Validar com SPED"}
                                    </Button>
                                </CardContent>
                            </Card>

                            {validating && (
                                <Card className="shadow-lg mt-8">
                                    <CardHeader>
                                        <div className="flex items-center gap-3">
                                            <BrainCircuit className="h-8 w-8 text-primary animate-pulse" />
                                            <div>
                                                <CardTitle className="font-headline text-2xl">Validando SPED...</CardTitle>
                                                <CardDescription>Aguarde enquanto as chaves são comparadas.</CardDescription>
                                            </div>
                                        </div>
                                    </Header>
                                     <CardContent className="space-y-4">
                                       <Skeleton className="h-8 w-full" />
                                       <Skeleton className="h-32 w-full" />
                                    </CardContent>
                                </Card>
                            )}

                             {keyCheckResults && spedInfo && (
                                <Card className="shadow-lg mt-8">
                                    <CardHeader>
                                        <div className="flex items-center gap-3 p-4 bg-secondary rounded-lg">
                                            <AlertTriangle className="h-8 w-8 text-amber-600" />
                                            <div>
                                                <h3 className="font-headline text-xl">Resultados da Validação SPED</h3>
                                                <p className="text-muted-foreground">Comparação entre os XMLs/planilhas e o arquivo SPED TXT.</p>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                         <KeyResultsDisplay results={keyCheckResults} cnpj={spedInfo.cnpj} />
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>
                    </Tabs>
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
