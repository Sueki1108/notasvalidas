// src/app/page.tsx
"use client";

import { useContext, useState } from "react";
import * as XLSX from "xlsx";
import { Sheet, FileText, UploadCloud, Cpu, BrainCircuit, Trash2, History, Group, AlertTriangle, KeyRound, ChevronDown, FileText as FileTextIcon, FolderSync, Search, Replace, Download as DownloadIcon, Layers, Wand2, GitCompare, FileWarning, LandPlot, BookCheck, Truck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { ResultsDisplay } from "@/components/app/results-display";
import { KeyResultsDisplay } from "@/components/app/key-results-display";
import { validateWithSped, compareCfopAndAccounting, analyzeCteData, type KeyCheckResult, type SpedInfo, type CfopComparisonResult, type CfopAccountingComparisonResult } from "@/app/actions";
import { processDataFrames } from "@/lib/excel-processor";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { formatCnpj } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppContext } from "@/context/AppContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/app/data-table";
import { getColumns } from "@/lib/columns-helper";


type DataFrames = { [key: string]: any[] };

const normalizeKey = (key: any): string => {
    if (!key) return '';
    return String(key).replace(/\D/g, '').trim();
}

type ExceptionKeys = {
    OperacaoNaoRealizada: Set<string>;
    Desconhecimento: Set<string>;
    Desacordo: Set<string>;
};

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
    
    const procEventoNFe = xmlDoc.getElementsByTagName('procEventoNFe')[0];
    if (procEventoNFe) {
        const infEvento = procEventoNFe.getElementsByTagName('infEvento')[0];
        if (infEvento) {
            const chNFe = normalizeKey(getValue('chNFe', infEvento)) || '';
            const tpEvento = getValue('tpEvento', infEvento) || '';

            const eventTypeMap: { [key: string]: string } = {
                '110111': 'Cancelamento',
                '210240': 'OperacaoNaoRealizada',
                '411500': 'Desconhecimento',
            };
            
            const eventType = eventTypeMap[tpEvento];
            if (eventType) {
                 return { isEvent: true, eventType, key: chNFe, uploadSource };
            }
        }
        return null; 
    }

    const infNFe = xmlDoc.getElementsByTagName('infNFe')[0];
    if(!infNFe) return null;

    const ide = infNFe.getElementsByTagName('ide')[0];
    
    const firstItemCfop = infNFe.getElementsByTagName('det')[0]?.getElementsByTagName('prod')[0]?.getElementsByTagName('CFOP')[0]?.textContent || '';
    
    const emit = infNFe.getElementsByTagName('emit')[0];
    const dest = infNFe.getElementsByTagName('dest')[0];
    const total = infNFe.getElementsByTagName('ICMSTot')[0];
    
    const protNFe = xmlDoc.getElementsByTagName('protNFe')[0];
    const infProt = protNFe ? protNFe.getElementsByTagName('infProt')[0] : null;
    
    const chNFe = normalizeKey(infProt ? getValue('chNFe', infProt) : (infNFe.getAttribute('Id') || '').replace('NFe',''));


    if (!ide || !emit || !total || !chNFe) return null;
    
    const cStat = infProt ? getValue('cStat', infProt) : '0';

    const numeroNF = getValue('nNF', ide);
    const isSaida = getValue('tpNF', ide) === '1';

    const nota = {
        'Chave de acesso': chNFe,
        'CFOP': firstItemCfop,
        'Número': numeroNF,
        'Data de Emissão': getValue('dhEmi', ide),
        'Valor': getValue('vNF', total),
        'Status': parseInt(cStat) === 100 ? 'Autorizadas' : (parseInt(cStat) === 101 ? 'Canceladas' : `Status ${cStat}`),
        'Emitente CPF/CNPJ': getValue('CNPJ', emit) || getValue('CPF', emit),
        'Emitente': getValue('xNome', emit),
        'Destinatário CPF/CNPJ': dest ? (getValue('CNPJ', dest) || getValue('CPF', dest)) : '',
        'Destinatário': dest ? getValue('xNome', dest) : '',
        'Fornecedor/Cliente': isSaida ? (dest ? getValue('xNome', dest): '') : (getValue('xNome', emit)),
        'uploadSource': uploadSource,
        'docType': 'NFe',
    };

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
            'Chave de acesso': chNFe,
            'Número da NF': numeroNF,
            'Número do Item': det.getAttribute('nItem'),
            'Código do Produto': getValue('cProd', prod),
            'Descrição do Produto': getValue('xProd', prod),
            'CFOP': getValue('CFOP', prod),
            'NCM': getValue('NCM', prod),
            'Quantidade': parseFloat(getValue('qCom', prod) || '0'),
            'Unidade': getValue('uCom', prod),
            'Valor Unitário': parseFloat(getValue('vUnCom', prod) || '0'),
            'Valor Total do Produto': parseFloat(getValue('vProd', prod) || '0'),
            'Valor do Desconto': parseFloat(getValue('vDesc', prod) || '0'),
            'EAN': getValue('cEAN', prod),
            'CEST': getValue('CEST', prod),
            'Pedido Compra': getValue('xPed', prod),
            'ICMS Origem': icms ? getValue('orig', icms) : '',
            'ICMS CST': icms ? getValue('CST', icms) : '',
            'ICMS Modalidade BC': icms ? getValue('modBC', icms) : '',
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
            'uploadSource': uploadSource
        });
    }

    return { nota, itens };
}

const extractCteDataFromXml = (xmlContent: string, uploadSource: string) => {
    if (typeof window === 'undefined') return null;
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
    const errorNode = xmlDoc.querySelector("parsererror");
    if (errorNode) {
      console.error("Error parsing XML:", errorNode.textContent);
      return null;
    }

    const getValue = (tag: string, context: Element | null) => context?.getElementsByTagName(tag)[0]?.textContent || '';
    
    const eventoCTe = xmlDoc.getElementsByTagName('eventoCTe')[0];
    if (eventoCTe) {
        const infEvento = eventoCTe.getElementsByTagName('infEvento')[0];
        if (infEvento) {
            const chCTe = normalizeKey(getValue('chCTe', infEvento));
            const tpEvento = getValue('tpEvento', infEvento);

            if (tpEvento === '610110') {
                 return { isEvent: true, eventType: 'Desacordo', key: chCTe, uploadSource };
            }
        }
        return null;
    }
    
    const infCte = xmlDoc.getElementsByTagName('infCte')[0];
    if(!infCte) return null;

    const ide = infCte.getElementsByTagName('ide')[0];
    const emit = infCte.getElementsByTagName('emit')[0];
    const vPrest = infCte.getElementsByTagName('vPrest')[0];
    const protCTe = xmlDoc.getElementsByTagName('protCTe')[0];

    if(!ide || !emit || !vPrest || !protCTe) return null;
    
    const infProt = protCTe.getElementsByTagName('infProt')[0];
    if(!infProt) return null;

    const chCTe = normalizeKey(getValue('chCTe', infProt));
    const cStat = getValue('cStat', infProt) || '';

    const nota = {
        'Chave de acesso': chCTe,
        'Número': getValue('nCT', ide),
        'Data de Emissão': getValue('dhEmi', ide),
        'Valor': parseFloat(getValue('vTPrest', vPrest) || '0'),
        'Status': parseInt(cStat) === 100 ? 'Autorizadas' : `Status ${cStat}`,
        'Emitente CPF/CNPJ': getValue('CNPJ', emit) || getValue('CPF', emit),
        'Emitente': getValue('xNome', emit),
        'Fornecedor/Cliente': getValue('xNome', emit),
        'uploadSource': uploadSource,
        'docType': 'CTe',
    };

    return { nota };
}

export default function Home() {
    const {
      files,
      setFiles,
      spedFiles,
      setSpedFiles,
      accountingFile,
      setAccountingFile,
      results,
      setResults,
      keyCheckResults,
      setKeyCheckResult,
      spedInfo,
      setSpedInfo,
      cfopAccountingResult,
      setCfopAccountingResult,
      cteAnalysisResult,
      setCteAnalysisResult,
      activeTab,
      setActiveTab,
      clearAllData,
      detectedMonths,
      setDetectedMonths,
      setSelectedMonths,
    } = useContext(AppContext);

    const [processing, setProcessing] = useState(false);
    const [validating, setValidating] = useState(false);
    const [comparingCfopAccounting, setComparingCfopAccounting] = useState(false);
    const [analyzingCte, setAnalyzingCte] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isMonthModalOpen, setIsMonthModalOpen] = useState(false);
    const [tempSelectedMonths, setTempSelectedMonths] = useState<Set<string>>(new Set());
    const { toast } = useToast();
    

    const primaryXmlFiles = ["XMLs de Entrada (NFe)", "XMLs de Entrada (CTe)", "XMLs de Saída"];
    const manifestationXmlFiles = ["XMLs de Operação Não Realizada", "XMLs de Desconhecimento do Destinatário", "XMLs de Desacordo (CTe)"];
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        const fileName = e.target.name;
        if (selectedFiles && selectedFiles.length > 0) {
            if (fileName === 'SPED TXT') {
                setSpedFiles(prev => [...(prev || []), ...Array.from(selectedFiles)]);
            } else if (fileName === 'Lote de Contabilização') {
                setAccountingFile(selectedFiles[0]);
            }
            else {
                 setFiles(prev => ({
                    ...prev,
                    [fileName]: [...(prev[fileName] || []), ...Array.from(selectedFiles)]
                }));
            }
        }
    };

    const handleClearFile = (fileName: string) => {
        if (fileName === 'SPED TXT') {
            setSpedFiles(null);
            setSpedInfo(null);
            setKeyCheckResult(null);
            const input = document.querySelector(`input[name="SPED TXT"]`) as HTMLInputElement;
            if (input) input.value = "";
        } else if (fileName === 'Lote de Contabilização') {
            setAccountingFile(null);
            const input = document.querySelector(`input[name="Lote de Contabilização"]`) as HTMLInputElement;
            if (input) input.value = "";
        } else {
            setFiles(prev => ({...prev, [fileName]: null}));
            const input = document.querySelector(`input[name="${fileName}"]`) as HTMLInputElement;
            if (input) input.value = "";
        }
    };

    const processAndFilterData = async (selectedMonths: Set<string>) => {
        setProcessing(true);
        try {
            const allNfe: any[] = [];
            const allCte: any[] = [];
            const allNfeItensEntrada: any[] = [];
            const allNfeItensSaida: any[] = [];
            const exceptionKeys: ExceptionKeys = {
                OperacaoNaoRealizada: new Set<string>(),
                Desconhecimento: new Set<string>(),
                Desacordo: new Set<string>(),
            }
            const canceledKeys = new Set<string>();

            const getMonthYear = (dateStr: string) => {
                if (!dateStr) return null;
                try { return format(parseISO(dateStr), "MM/yyyy"); } catch { return null; }
            };

            const fileReadPromises = Object.entries(files).flatMap(([category, fileList]) => {
                if (!fileList) return [];
                return fileList.map(file => ({ file, category }));
            }).map(async ({ file, category }) => {
                const content = await file.text();
                const type = category.includes('CTe') ? 'CTe' : 'NFe';
                const uploadSource = category.includes('Saída') ? 'saida' : (category.includes('Entrada') ? 'entrada' : 'exception');
                return type === 'NFe' ? extractNfeDataFromXml(content, uploadSource) : extractCteDataFromXml(content, uploadSource);
            });
            
            const allXmlData = await Promise.all(fileReadPromises);

            for (const xmlData of allXmlData) {
                if (!xmlData) continue;
                if (xmlData.isEvent) {
                      if (xmlData.eventType === 'Cancelamento') {
                          canceledKeys.add(xmlData.key);
                      } else if (xmlData.eventType) {
                          const eventSet = exceptionKeys[xmlData.eventType as keyof typeof exceptionKeys];
                          if (eventSet) eventSet.add(xmlData.key);
                      }
                      continue;
                  }
                
                const monthYear = getMonthYear(xmlData.nota?.['Data de Emissão']);
                if (selectedMonths.size > 0 && (!monthYear || !selectedMonths.has(monthYear))) continue;

                if (xmlData.nota && xmlData.nota['Status']?.includes('Cancelada')) {
                      canceledKeys.add(xmlData.nota['Chave de acesso']);
                }

                if (xmlData.nota) {
                    if (xmlData.nota.docType === 'NFe') {
                        allNfe.push(xmlData);
                    } else if (xmlData.nota.docType === 'CTe') {
                        allCte.push(xmlData);
                    }
                }

                if(xmlData.itens){
                    const uploadSource = xmlData.nota.uploadSource;
                    if(uploadSource === 'entrada') allNfeItensEntrada.push(...xmlData.itens);
                    else if (uploadSource === 'saida') allNfeItensSaida.push(...xmlData.itens);
                }
            }


            const initialFrames = {
                'NF-Stock NFE': allNfe.filter(d => d.nota).map(d => d.nota),
                'NF-Stock CTE': allCte.filter(d => d.nota).map(d => d.nota),
                'Itens de Entrada': allNfeItensEntrada,
                'Itens de Saída': allNfeItensSaida,
                'NF-Stock Emitidas': [],
                'Notas Canceladas': Array.from(canceledKeys).map(key => ({ 'Chave de acesso': key }))
            };
            
            const firstSpedFile = spedFiles && spedFiles.length > 0 ? spedFiles[0] : null;
            const firstSpedLine = firstSpedFile ? (await firstSpedFile.text()).split('\n')[0]?.trim() || "" : "";
            const tempSpedInfo = parseSpedInfo(firstSpedLine);
            const companyCnpj = tempSpedInfo ? tempSpedInfo.cnpj : null;

            const processedData = processDataFrames(initialFrames, exceptionKeys, companyCnpj);
            
            setResults(processedData);
            if (companyCnpj) {
                setSpedInfo(tempSpedInfo);
            }
            toast({ title: "Processamento Inicial Concluído", description: "Arquivos XML processados. Avance para as próximas etapas." });
            setActiveTab('validate');
        } catch (err: any) {
            setError(err.message || "Ocorreu um erro desconhecido.");
            setResults(null);
            toast({ variant: "destructive", title: "Erro no Processamento", description: err.message });
        } finally {
            setProcessing(false);
        }
    };


    const handleProcessPrimaryFiles = async () => {
        setError(null);
        setKeyCheckResult(null);
        
        if (!Object.values(files).some(fileList => fileList && fileList.length > 0)) {
            toast({ variant: "destructive", title: "Nenhum arquivo carregado", description: "Por favor, carregue pelo menos um arquivo XML." });
            return;
        }

        setProcessing(true);
        const months = new Set<string>();

        const getMonthYear = (dateStr: string) => {
            if (!dateStr) return null;
            try { return format(parseISO(dateStr), "MM/yyyy"); } catch { return null; }
        };

        const checkFileDates = async (fileList: File[], category: string) => {
            const type = category.includes('CTe') ? 'CTe' : 'NFe';
            
            const fileReadPromises = fileList.map(file => file.text());
            const fileContents = await Promise.all(fileReadPromises);

            const parsingPromises = fileContents.map(content => {
                return Promise.resolve(
                    type === 'NFe' ? extractNfeDataFromXml(content, 'check') : extractCteDataFromXml(content, 'check')
                );
            });
            const allXmlData = (await Promise.all(parsingPromises)).filter(Boolean);
            
            for (const xmlData of allXmlData) {
                if (xmlData?.nota) {
                    const monthYear = getMonthYear(xmlData.nota['Data de Emissão']);
                    if (monthYear) months.add(monthYear);
                }
            }
        };

        const fileProcessingPromises = Object.keys(files).map(category => {
            const fileList = files[category];
            if(fileList && fileList.length > 0 && category.includes('XML')) {
                return checkFileDates(fileList, category);
            }
            return Promise.resolve();
        });

        await Promise.all(fileProcessingPromises);
        
        const sortedMonths = Array.from(months).sort((a, b) => {
            const [aMonth, aYear] = a.split('/');
            const [bMonth, bYear] = b.split('/');
            return new Date(parseInt(aYear), parseInt(aMonth) - 1).getTime() - new Date(parseInt(bYear), parseInt(bMonth) - 1).getTime();
        });

        if (sortedMonths.length > 1) {
            setProcessing(false);
            setDetectedMonths(sortedMonths);
            setTempSelectedMonths(new Set(sortedMonths)); // Pre-select all
            setIsMonthModalOpen(true);
        } else {
            const selected = new Set(sortedMonths);
            setSelectedMonths(selected);
            await processAndFilterData(selected);
        }
    };
    
    const handleMonthSelectionConfirm = async () => {
        setIsMonthModalOpen(false);
        setSelectedMonths(tempSelectedMonths);
        await processAndFilterData(tempSelectedMonths);
    };

    const handleValidateWithSped = async () => {
        if (!spedFiles || spedFiles.length === 0) {
            toast({ variant: "destructive", title: "Arquivo SPED Ausente", description: "Por favor, carregue pelo menos um arquivo SPED TXT." });
            return;
        }
        if (!results) {
             toast({ variant: "destructive", title: "Dados não processados", description: "Processe os arquivos XML na aba 'Processamento Principal' primeiro." });
            return;
        }

        setError(null);
        setValidating(true);
        setKeyCheckResult(null);
        
        try {
            const spedContents = await Promise.all(spedFiles.map(file => file.text()));
            
            const validationResult = await validateWithSped(results, spedContents);
            
            if (validationResult.error) {
                throw new Error(validationResult.error);
            }

            if (validationResult.keyCheckResults) {
                 setKeyCheckResult(validationResult.keyCheckResults);
            }
            if (validationResult.spedInfo) {
                setSpedInfo(validationResult.spedInfo);
            }
            
            // Add SPED keys to the main results for display
            if (results && validationResult.keyCheckResults?.allSpedKeys) {
                setResults({ ...results, "Chaves Encontradas no SPED": validationResult.keyCheckResults.allSpedKeys });
            }
            
            toast({ title: "Validação SPED Concluída", description: `A verificação das chaves foi finalizada.` });
            
        } catch (err: any) {
             setError(err.message || "Ocorreu um erro desconhecido na validação.");
             setKeyCheckResult(null);
             toast({ variant: "destructive", title: "Erro na Validação SPED", description: err.message });
        } finally {
            setValidating(false);
        }
    };
    
    const handleCompareCfopAccounting = async () => {
        // This function requires a valid CFOP comparison result which is now done in a separate page.
        // Let's check for the results from the main processing first.
        const cfopComparisonResult: CfopComparisonResult | null = null; // This would need to be passed from the new page or re-calculated. For now, this is a limitation.

        if (!cfopComparisonResult) {
            toast({ variant: "destructive", title: "Dados Incompletos", description: "Execute a 'Comparação XML X Sage' na página de ferramentas primeiro." });
            return;
        }
        if (!accountingFile) {
            toast({ variant: "destructive", title: "Arquivo Ausente", description: "Carregue o arquivo 'Lote de Contabilização'." });
            return;
        }

        setComparingCfopAccounting(true);
        setError(null);
        setCfopAccountingResult(null);

        try {
            const fileContent = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => event.target?.result ? resolve(event.target.result as string) : reject(new Error("Falha ao ler o arquivo."));
                reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
                reader.readAsText(accountingFile, 'utf-8');
            });
            
            const result = await compareCfopAndAccounting({
                cfopComparison: cfopComparisonResult,
                accountingFileContent: fileContent,
            });

            if (result.error) throw new Error(result.error);

            setCfopAccountingResult(result.results);
            toast({ title: "Comparação Concluída", description: "CFOPs e Contabilização foram cruzados com sucesso." });
        } catch(err: any) {
             setError(err.message || "Ocorreu um erro desconhecido na comparação contábil.");
            toast({ variant: "destructive", title: "Erro na Comparação Contábil", description: err.message });
        } finally {
            setComparingCfopAccounting(false);
        }
    };

    const handleDownloadCfopAccounting = () => {
        if (!cfopAccountingResult || cfopAccountingResult.length === 0) {
            toast({ variant: "destructive", title: "Sem dados", description: "Não há dados para baixar." });
            return;
        }
        const worksheet = XLSX.utils.json_to_sheet(cfopAccountingResult);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "CFOP_x_Contabilizacao");
        XLSX.writeFile(workbook, "relatorio_cfop_contabilizacao.ods", { bookType: "ods" });
        toast({ title: "Download Iniciado", description: "O relatório foi gerado." });
    };

     const handleAnalyzeCte = async () => {
        const cteFiles = files['XMLs de Entrada (CTe)'];
        const nfeSaidaFiles = files['XMLs de Saída'];
        
        if (!cteFiles || cteFiles.length === 0) {
            toast({ variant: "destructive", title: "Arquivos Ausentes", description: "Carregue os 'XMLs de Entrada (CTe)' na Etapa 1." });
            return;
        }
        if (!nfeSaidaFiles || nfeSaidaFiles.length === 0) {
            toast({ variant: "destructive", title: "Arquivos Ausentes", description: "Carregue os 'XMLs de Saída' na Etapa 1." });
            return;
        }
         if (!spedInfo || !spedInfo.cnpj) {
            toast({ variant: "destructive", title: "CNPJ da Empresa Ausente", description: "Processe um arquivo SPED na Etapa 2 para identificar o CNPJ da empresa." });
            return;
        }


        setAnalyzingCte(true);
        setError(null);
        setCteAnalysisResult(null);

        try {
            const fileContents = async (fileList: File[]) => {
                return Promise.all(
                    fileList.map(file => file.text().then(content => ({ name: file.name, content })))
                );
            };
            
            const result = await analyzeCteData({
                cteFiles: await fileContents(cteFiles),
                nfeSaidaFiles: await fileContents(nfeSaidaFiles),
                companyCnpj: spedInfo.cnpj,
            });

            if (result.error) throw new Error(result.error);

            setCteAnalysisResult(result);
            toast({ title: "Análise de CT-e Concluída", description: "CT-es foram classificados e cruzados com as NF-es de origem." });

        } catch (err: any) {
            setError(err.message || "Ocorreu um erro na análise de CT-e.");
            toast({ variant: "destructive", title: "Erro na Análise de CT-e", description: err.message });
        } finally {
            setAnalyzingCte(false);
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
                "Estornos": "Estornos",
                "NF-Stock Emitidas": "NF Emitidas",
                "Notas Válidas": "Notas Validas",
                "Emissão Própria": "Emissao Propria",
                "Notas Canceladas": "Notas Canceladas",
                "Itens de Entrada": "Itens de Entrada",
                "Itens de Saída": "Itens de Saida",
                "Imobilizados": "Imobilizados",
                "Chaves Válidas": "Chaves Validas",
                "Chaves Encontradas no SPED": "Chaves SPED"
            };
            const orderedSheetNames = [
                "Notas Válidas", "Itens de Entrada", "Emissão Própria", "Itens de Saída", "Chaves Válidas", "Imobilizados",
                 "Notas Canceladas", "NF-Stock NFE Operação Não Realizada", "NF-Stock NFE Operação Desconhecida", "NF-Stock CTE Desacordo de Serviço",
                 "Chaves Encontradas no SPED"
            ].filter(name => results[name] && results[name].length > 0);

            orderedSheetNames.forEach(sheetName => {
                const worksheet = XLSX.utils.json_to_sheet(results[sheetName]);
                if (results[sheetName].length > 0) {
                    worksheet['!cols'] = Object.keys(results[sheetName][0] || {}).map(() => ({ wch: 20 }));
                }
                const excelSheetName = sheetNameMap[sheetName] || sheetName;
                XLSX.utils.book_append_sheet(workbook, worksheet, excelSheetName);
            });

            const buffer = XLSX.write(workbook, { bookType: 'ods', type: 'array' });
            const blob = new Blob([buffer], { type: 'application/vnd.oasis.opendocument.spreadsheet' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'Planilhas_Processadas.ods';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast({ title: "Download Iniciado", description: "O arquivo ODS está sendo baixado." });
        } catch (err: any) {
            setError("Falha ao gerar o arquivo ODS.");
            toast({ variant: "destructive", title: "Erro no Download", description: "Não foi possível gerar o arquivo ODS." });
        }
    };

    const parseSpedInfo = (spedLine: string): SpedInfo | null => {
        if (!spedLine || !spedLine.startsWith('|0000|')) return null;
        const parts = spedLine.split('|');
        if (parts.length < 10) return null;
        const startDate = parts[4]; 
        const companyName = parts[6];
        const cnpj = parts[7];
        if (!startDate || !companyName || !cnpj || startDate.length !== 8) return null;
        const month = startDate.substring(2, 4);
        const year = startDate.substring(4, 8);
        const competence = `${month}/${year}`;
        return { cnpj, companyName, competence };
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
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost">Ferramentas <ChevronDown className="ml-2 h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem asChild><Link href="/merger" className="flex items-center gap-2 w-full"><Group />Agrupador de Planilhas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/juntar-abas" className="flex items-center gap-2 w-full"><Layers />Juntar Abas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/solver" className="flex items-center gap-2 w-full"><Wand2 />Solver</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/unify-folders" className="flex items-center gap-2 w-full"><FolderSync />Unificar Pastas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/extract-nfe" className="flex items-center gap-2 w-full"><Search />Extrair Itens (NF-e)</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/extract-cte" className="flex items-center gap-2 w-full"><Search />Extrair CT-e</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/returns" className="flex items-center gap-2 w-full"><FileText />Devoluções</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/alterar-xml" className="flex items-center gap-2 w-full"><Replace />Alterar XML</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/separar-xml" className="flex items-center gap-2 w-full"><FileText />Separar XML</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/compare-xml-sage" className="flex items-center gap-2 w-full"><GitCompare />Comparação XML x Sage</Link></DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="ghost" asChild>
                            <Link href="/history">Histórico</Link>
                        </Button>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                 <AlertDialog open={isMonthModalOpen} onOpenChange={setIsMonthModalOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Múltiplos Períodos Detectados</AlertDialogTitle>
                        <AlertDialogDescription>
                            Encontramos arquivos de mais de um mês. Por favor, selecione quais períodos você deseja incluir no processamento.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="space-y-2 py-4">
                            {detectedMonths.map(month => (
                                <div key={month} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={month}
                                        checked={tempSelectedMonths.has(month)}
                                        onCheckedChange={(checked) => {
                                            setTempSelectedMonths(prev => {
                                                const newSet = new Set(prev);
                                                if (checked) {
                                                    newSet.add(month);
                                                } else {
                                                    newSet.delete(month);
                                                }
                                                return newSet;
                                            });
                                        }}
                                    />
                                    <Label htmlFor={month} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {month}
                                    </Label>
                                </div>
                            ))}
                        </div>
                        <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleMonthSelectionConfirm} disabled={tempSelectedMonths.size === 0}>
                            Processar Selecionados
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>


                <div className="mx-auto max-w-7xl space-y-8">
                     <div className="flex justify-between items-center">
                        <h2 className="text-3xl font-bold font-headline text-primary flex items-center gap-2">
                            Fluxo de Conferência
                        </h2>
                        <Button onClick={() => clearAllData()} variant="destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Limpar Tudo e Recomeçar
                        </Button>
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="process">1. Processamento XML</TabsTrigger>
                            <TabsTrigger value="validate" disabled={!results}>2. Validação SPED</TabsTrigger>
                            <TabsTrigger value="advanced" disabled={!results}>3. Análises Avançadas</TabsTrigger>
                        </TabsList>
                        <TabsContent value="process" className="mt-6 space-y-6">
                            <Card className="shadow-lg">
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <UploadCloud className="h-8 w-8 text-primary" />
                                        <div>
                                            <CardTitle className="font-headline text-2xl">Carregar Arquivos XML Principais</CardTitle>
                                            <CardDescription>Faça o upload dos arquivos XML de entrada e saída.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <FileUploadForm
                                        requiredFiles={primaryXmlFiles}
                                        files={files}
                                        onFileChange={handleFileChange}
                                        onClearFile={handleClearFile}
                                        disabled={!!results}
                                    />
                                </CardContent>
                            </Card>
                             <Card className="shadow-lg">
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <FileWarning className="h-8 w-8 text-amber-500" />
                                        <div>
                                            <CardTitle className="font-headline text-2xl">Carregar XMLs de Manifestação (Opcional)</CardTitle>
                                            <CardDescription>Faça o upload de arquivos de eventos como operação não realizada, desconhecimento e desacordo.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <FileUploadForm
                                        requiredFiles={manifestationXmlFiles}
                                        files={files}
                                        onFileChange={handleFileChange}
                                        onClearFile={handleClearFile}
                                        disabled={!!results}
                                    />
                                </CardContent>
                            </Card>

                            {!results && (
                                <Button onClick={handleProcessPrimaryFiles} disabled={processing} className="w-full text-lg py-6">
                                    {processing ? "Processando..." : "Processar Arquivos XML"}
                                </Button>
                            )}
                             {activeTab === 'process' && results && (
                                 <div className="flex flex-col gap-2 sm:flex-row">
                                    <Button onClick={handleDownload} className="w-full">
                                        <DownloadIcon className="mr-2"/> Baixar Planilha Processada
                                    </Button>
                                    <Button onClick={() => setActiveTab('validate')} className="w-full">
                                        Ir para Validação SPED
                                    </Button>
                                 </div>
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
                                        files={{ "SPED TXT": spedFiles }}
                                        onFileChange={handleFileChange}
                                        onClearFile={handleClearFile}
                                    />
                                    <Button onClick={handleValidateWithSped} disabled={validating || !spedFiles || spedFiles.length === 0} className="w-full">
                                        {validating ? "Validando e Extraindo Dados do SPED..." : "Validar e Extrair Dados do SPED"}
                                    </Button>
                                    
                                     {spedInfo && (
                                        <Alert variant="default" className="border-primary/50">
                                            <FileTextIcon className="h-4 w-4" />
                                            <AlertTitle>Resumo do Arquivo SPED</AlertTitle>
                                            <AlertDescription>
                                                <p><strong>Empresa:</strong> {spedInfo.companyName}</p>
                                                <p><strong>CNPJ:</strong> {formatCnpj(spedInfo.cnpj)}</p>
                                                <p><strong>Competência:</strong> {spedInfo.competence}</p>
                                                <p><strong>Total de Chaves Encontradas:</strong> {keyCheckResults?.allSpedKeys.length || 0}</p>
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    {keyCheckResults && (
                                        <div className="mt-6">
                                            <h3 className="text-xl font-bold mb-4">Resultados da Validação</h3>
                                             <KeyResultsDisplay results={keyCheckResults} cnpj={spedInfo?.cnpj || null} />
                                        </div>
                                    )}

                                    {validating && (
                                        <div className="flex justify-center p-8">
                                            <Cpu className="h-8 w-8 animate-spin" />
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="advanced" className="mt-6">
                            <Card>
                                <CardHeader>
                                     <div className="flex items-center gap-3">
                                        <BrainCircuit className="h-8 w-8 text-primary" />
                                        <div>
                                            <CardTitle className="font-headline text-2xl">Análises Avançadas</CardTitle>
                                            <CardDescription>Carregue planilhas de impostos e realize comparações detalhadas.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                     <Tabs defaultValue="compare-cfop-accounting">
                                        <TabsList className="grid w-full grid-cols-2">
                                            <TabsTrigger value="compare-cfop-accounting">CFOP x Contabilização</TabsTrigger>
                                            <TabsTrigger value="cte-analysis">Análise de CT-e</TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="compare-cfop-accounting" className="mt-4">
                                            <Card>
                                                <CardHeader>
                                                     <div className="flex items-center gap-3">
                                                        <BookCheck className="h-8 w-8 text-primary" />
                                                        <div>
                                                            <CardTitle className="font-headline text-xl">Comparar CFOP e Contabilização</CardTitle>
                                                            <CardDescription>Carregue o Lote de Contabilização para cruzar com os dados de CFOP. Requer que a "Comparação XML X Sage" seja executada primeiro na página de ferramentas.</CardDescription>
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                                 <CardContent className="space-y-6">
                                                    <FileUploadForm
                                                        requiredFiles={["Lote de Contabilização"]}
                                                        files={{ "Lote de Contabilização": accountingFile }}
                                                        onFileChange={handleFileChange}
                                                        onClearFile={handleClearFile}
                                                    />
                                                    <Button onClick={handleCompareCfopAccounting} disabled={comparingCfopAccounting || !accountingFile} className="w-full">
                                                        {comparingCfopAccounting ? "Comparando..." : "Gerar Relatório CFOP x Contabilização"}
                                                    </Button>
                                                     {cfopAccountingResult && cfopAccountingResult.length > 0 && (
                                                        <>
                                                            <DataTable columns={getColumns(cfopAccountingResult)} data={cfopAccountingResult} />
                                                            <Button onClick={handleDownloadCfopAccounting} className="w-full">
                                                                <DownloadIcon className="mr-2" /> Baixar Relatório
                                                            </Button>
                                                        </>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </TabsContent>
                                         <TabsContent value="cte-analysis" className="mt-4">
                                            <Card>
                                                <CardHeader>
                                                     <div className="flex items-center gap-3">
                                                        <Truck className="h-8 w-8 text-primary" />
                                                        <div>
                                                            <CardTitle className="font-headline text-xl">Análise de CT-e</CardTitle>
                                                            <CardDescription>Cruze os dados de CT-e com as NF-es de saída para encontrar o CFOP de origem. Requer o SPED carregado (Etapa 2) para identificar o CNPJ.</CardDescription>
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                                 <CardContent className="space-y-6">
                                                    <Button onClick={handleAnalyzeCte} disabled={analyzingCte || !(files['XMLs de Entrada (CTe)'] && files['XMLs de Saída'])} className="w-full">
                                                        {analyzingCte ? "Analisando..." : "Analisar CT-es"}
                                                    </Button>
                                                    {cteAnalysisResult && (
                                                        <div className="space-y-4">
                                                             <Card>
                                                                <CardHeader><CardTitle>CT-e como Remetente ({cteAnalysisResult.cteRemetente.length})</CardTitle></CardHeader>
                                                                <CardContent>
                                                                     {cteAnalysisResult.cteRemetente.length > 0 ? <DataTable columns={getColumns(cteAnalysisResult.cteRemetente)} data={cteAnalysisResult.cteRemetente} /> : <p>Nenhum CT-e encontrado.</p>}
                                                                </CardContent>
                                                            </Card>
                                                             <Card>
                                                                <CardHeader><CardTitle>CT-e como Destinatário ({cteAnalysisResult.cteDestinatario.length})</CardTitle></CardHeader>
                                                                <CardContent>
                                                                     {cteAnalysisResult.cteDestinatario.length > 0 ? <DataTable columns={getColumns(cteAnalysisResult.cteDestinatario)} data={cteAnalysisResult.cteDestinatario} /> : <p>Nenhum CT-e encontrado.</p>}
                                                                </CardContent>
                                                            </Card>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </TabsContent>
                                     </Tabs>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                    
                     {error && (
                        <Alert variant="destructive" className="mt-8">
                            <FileText className="h-4 w-4" />
                            <AlertTitle>Erro</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    
                    {/* ----- Display Results Sections ----- */}

                    {processing && (
                        <Card className="shadow-lg mt-8">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <Cpu className="h-8 w-8 text-primary animate-pulse" />
                                    <div>
                                        <CardTitle className="font-headline text-2xl">Processando Arquivos...</CardTitle>
                                        <CardDescription>Aguarde enquanto os dados primários são analisados.</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                               <Skeleton className="h-8 w-full" />
                               <Skeleton className="h-32 w-full" />
                            </CardContent>
                        </Card>
                    )}
                    
                     {activeTab === 'process' && results && (
                        <Card className="shadow-lg mt-8">
                            <CardHeader>
                                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-3">
                                        <FileText className="h-8 w-8 text-primary" />
                                        <div>
                                            <CardTitle className="font-headline text-2xl">Resultados do Processamento XML</CardTitle>
                                            <CardDescription>Visualize e baixe os dados processados dos arquivos XML.</CardDescription>
                                        </div>
                                    </div>
                                    <Button onClick={handleDownload} disabled={!results}>
                                        <DownloadIcon className="mr-2"/>Baixar Planilha (.ods)
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
