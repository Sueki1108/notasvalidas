// src/app/compare-xml-sage/page.tsx
"use client";

import * as React from "react";
import { useState } from "react";
import Link from 'next/link';
import { Sheet, UploadCloud, Download, Trash2, File as FileIcon, Loader2, History, Group, ChevronDown, FileText, FolderSync, Search, Replace, Layers, Wand2, GitCompare } from "lucide-react";
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
import { compareCfopData, type CfopComparisonResult } from "@/app/actions";
import { FileUploadForm, type FileList } from "@/components/app/file-upload-form";
import { CfopResultsDisplay } from "@/components/app/cfop-results-display";

// Helper function to extract NFE data from XML
const extractNfeDataFromXml = (xmlContent: string, uploadSource: string) => {
    if (typeof window === 'undefined') return null;
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
    const errorNode = xmlDoc.querySelector("parsererror");
    if (errorNode) {
      console.error("Error parsing XML:", errorNode.textContent);
      return null;
    }

    const getValue = (tag: string, context: Element | null) => context?.getElementsByTagName(tag)[0]?.textContent || '';
    
    const infNFe = xmlDoc.getElementsByTagName('infNFe')[0];
    if(!infNFe) return null;

    const ide = infNFe.getElementsByTagName('ide')[0];
    const numeroNF = getValue('nNF', ide);

    const itens: any[] = [];
    const detElements = Array.from(infNFe.getElementsByTagName('det'));

    for (const det of detElements) {
        const prod = det.getElementsByTagName('prod')[0];
        const imposto = det.getElementsByTagName('imposto')[0];
        if (!prod || !imposto) continue;

        const icms = imposto.getElementsByTagName('ICMS')[0]?.firstElementChild;
        const ipi = imposto.getElementsByTagName('IPI')[0]?.getElementsByTagName('IPITrib')[0];
        const pis = imposto.getElementsByTagName('PIS')[0]?.firstElementChild;
        const cofins = imposto.getElementsByTagName('COFINS')[0]?.firstElementChild;

        itens.push({
            'Número da NF': numeroNF,
            'Código do Produto': getValue('cProd', prod),
            'Descrição do Produto': getValue('xProd', prod),
            'CFOP': getValue('CFOP', prod),
            'NCM': getValue('NCM', prod),
            'Valor Total do Produto': parseFloat(getValue('vProd', prod) || '0'),
            'ICMS CST': icms ? getValue('CST', icms) : '',
            'ICMS Base de Cálculo': icms ? parseFloat(getValue('vBC', icms) || '0') : 0,
            'ICMS Alíquota': icms ? parseFloat(getValue('pICMS', icms) || '0') : 0,
            'ICMS Valor': icms ? parseFloat(getValue('vICMS', icms) || '0') : 0,
            'ICMS vBCSTRet': icms ? parseFloat(getValue('vBCSTRet', icms) || '0') : 0,
            'ICMS pST': icms ? parseFloat(getValue('pST', icms) || '0') : 0,
            'ICMS vICMSSTRet': icms ? parseFloat(getValue('vICMSSTRet', icms) || '0') : 0,
            'IPI CST': ipi ? getValue('CST', ipi) : '',
            'IPI Base de Cálculo': ipi ? parseFloat(getValue('vBC', ipi) || '0') : 0,
            'IPI Alíquota': ipi ? parseFloat(getValue('pIPI', ipi) || '0') : 0,
            'IPI Valor': ipi ? parseFloat(getValue('vIPI', ipi) || '0') : 0,
            'PIS CST': pis ? getValue('CST', pis) : '',
            'PIS Base de Cálculo': pis ? parseFloat(getValue('vBC', pis) || '0') : 0,
            'PIS Alíquota': pis ? parseFloat(getValue('pPIS', pis) || '0') : 0,
            'PIS Valor': pis ? parseFloat(getValue('vPIS', pis) || '0') : 0,
            'COFINS CST': cofins ? getValue('CST', cofins) : '',
            'COFINS Base de Cálculo': cofins ? parseFloat(getValue('vBC', cofins) || '0') : 0,
            'COFINS Alíquota': cofins ? parseFloat(getValue('pCOFINS', cofins) || '0') : 0,
            'COFINS Valor': cofins ? parseFloat(getValue('vCOFINS', cofins) || '0') : 0,
        });
    }
    return itens;
}

export default function CompareXmlSagePage() {
    const [xmlFiles, setXmlFiles] = useState<FileList>({});
    const [taxFiles, setTaxFiles] = useState<FileList>({});
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [comparisonResult, setComparisonResult] = useState<CfopComparisonResult | null>(null);
    const { toast } = useToast();

    const xmlFileCategories = ["XMLs de Entrada", "XMLs de Saída"];
    const taxSheetCategories = ["Planilha ICMS", "Planilha ICMS ST", "Planilha PIS", "Planilha COFINS", "Planilha IPI"];

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, categoryList: string[]) => {
        const selectedFiles = e.target.files;
        const fileName = e.target.name;
        if (selectedFiles && selectedFiles.length > 0) {
            if (categoryList.includes(fileName)) {
                (xmlFileCategories.includes(fileName) ? setXmlFiles : setTaxFiles)(prev => ({
                    ...prev,
                    [fileName]: categoryList === xmlFileCategories ? [...(prev[fileName] || []), ...Array.from(selectedFiles)] : selectedFiles[0]
                }));
            }
        }
    };
    
    const handleClearFile = (fileName: string, categoryList: string[]) => {
        const setFunction = categoryList === xmlFileCategories ? setXmlFiles : setTaxFiles;
        setFunction(prev => ({...prev, [fileName]: null}));
        const input = document.querySelector(`input[name="${fileName}"]`) as HTMLInputElement;
        if (input) input.value = "";
    };
    
    const handleClearAll = () => {
        setXmlFiles({});
        setTaxFiles({});
        setComparisonResult(null);
        setError(null);
        document.querySelectorAll('input[type="file"]').forEach(input => (input as HTMLInputElement).value = "");
        toast({title: "Todos os arquivos e resultados foram limpos."});
    }

    const handleSubmit = async () => {
        const activeTaxFiles = Object.entries(taxFiles).filter(([_, file]) => file !== null);
        const activeXmlFiles = Object.entries(xmlFiles).filter(([_, fileList]) => fileList && fileList.length > 0);

        if (activeXmlFiles.length === 0) {
            toast({ variant: "destructive", title: "Nenhum XML Carregado", description: "Por favor, carregue pelo menos um arquivo XML." });
            return;
        }
        if (activeTaxFiles.length === 0) {
            toast({ variant: "destructive", title: "Nenhuma Planilha Carregada", description: "Por favor, carregue pelo menos uma planilha de imposto." });
            return;
        }
        
        setError(null);
        setProcessing(true);
        setComparisonResult(null);

        try {
            // 1. Process XMLs to get items
            const allXmlItems: any[] = [];
            for (const [category, fileList] of activeXmlFiles) {
                if (!fileList) continue;
                const fileReadPromises = (fileList as File[]).map(async file => {
                    const content = await file.text();
                    const uploadSource = category.includes("Saída") ? "saida" : "entrada";
                    return extractNfeDataFromXml(content, uploadSource) || [];
                });
                const itemsFromFiles = await Promise.all(fileReadPromises);
                allXmlItems.push(...itemsFromFiles.flat());
            }
            
            if (allXmlItems.length === 0) {
                throw new Error("Nenhum item válido encontrado nos arquivos XML carregados.");
            }

            // 2. Read Tax Sheets
            const sheetsData: { [key: string]: string } = {};
            for (const [taxName, file] of activeTaxFiles) {
                if (file) {
                    sheetsData[taxName] = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (event) => event.target?.result ? resolve(event.target.result as string) : reject(new Error(`Falha ao ler ${file.name}`));
                        reader.onerror = () => reject(new Error(`Erro ao ler ${file.name}`));
                        reader.readAsBinaryString(file as File);
                    });
                }
            }

            // 3. Call server action
            const result = await compareCfopData({
                xmlItemsData: allXmlItems,
                taxSheetsData: sheetsData,
            });
            
            if (result.error) throw new Error(result.error);
            
            setComparisonResult(result.results);
            toast({ title: "Comparação de Impostos Concluída", description: "A verificação dos itens foi finalizada." });

        } catch (err: any) {
            setError(err.message || "Ocorreu um erro na comparação de impostos.");
            setComparisonResult(null);
            toast({ variant: "destructive", title: "Erro na Comparação", description: err.message });
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
                        <Button variant="ghost" asChild><Link href="/">Processamento Principal</Link></Button>
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
                                <DropdownMenuItem asChild><Link href="/compare-xml-sage" className="flex items-center gap-2 w-full"><GitCompare />Comparação XML x Sage</Link></DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="ghost" asChild><Link href="/history">Histórico</Link></Button>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                <div className="mx-auto max-w-7xl space-y-8">
                    <Card className="shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <GitCompare className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Comparação XML x Sage</CardTitle>
                                    <CardDescription>Carregue os arquivos XML e as planilhas de impostos do Sage para comparar os itens.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>1. Carregar Arquivos XML</CardTitle>
                                    <CardDescription>Faça o upload dos arquivos XML de notas fiscais de entrada e/ou saída.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <FileUploadForm
                                        requiredFiles={xmlFileCategories}
                                        files={xmlFiles}
                                        onFileChange={(e) => handleFileChange(e, xmlFileCategories)}
                                        onClearFile={(name) => handleClearFile(name, xmlFileCategories)}
                                    />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>2. Carregar Planilhas de Impostos (Sage)</CardTitle>
                                    <CardDescription>Carregue as planilhas exportadas do Sage para cada tipo de imposto.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <FileUploadForm
                                        requiredFiles={taxSheetCategories}
                                        files={taxFiles}
                                        onFileChange={(e) => handleFileChange(e, taxSheetCategories)}
                                        onClearFile={(name) => handleClearFile(name, taxSheetCategories)}
                                    />
                                </CardContent>
                            </Card>
                            
                             {error && (
                                <Alert variant="destructive">
                                    <FileIcon className="h-4 w-4" />
                                    <AlertTitle>Erro</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button onClick={handleSubmit} disabled={processing} className="flex-grow">
                                    {processing ? <><Loader2 className="animate-spin" /> Comparando...</> : <><GitCompare /> Comparar Itens</>}
                                </Button>
                                <Button onClick={handleClearAll} variant="destructive" className="flex-shrink-0">
                                    <Trash2 /> Limpar Tudo
                                </Button>
                            </div>

                        </CardContent>
                    </Card>

                    {comparisonResult && (
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle className="font-headline text-2xl">Resultados da Comparação</CardTitle>
                                <CardDescription>Análise detalhada dos itens encontrados.</CardDescription>
                            </CardHeader>
                             <CardContent>
                                <CfopResultsDisplay results={comparisonResult} />
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
