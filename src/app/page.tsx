// src/app/page.tsx
"use client";

import { useContext, useState } from "react";
import * as XLSX from "xlsx";
import { Sheet, FileText, UploadCloud, Cpu, BrainCircuit, Trash2, History, Group, AlertTriangle, KeyRound, ChevronDown, FileText as FileTextIcon, FolderSync, Search, Replace, Download as DownloadIcon } from "lucide-react";
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
import { validateWithSped, type KeyCheckResult, type SpedInfo } from "@/app/actions";
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


type DataFrames = { [key: string]: any[] };

const normalizeKey = (key: any): string => {
    if (!key) return '';
    return String(key).replace(/\D/g, '').trim();
}

type ExceptionKeys = {
    OperacaoNaoRealizada: Set<string>;
    Desconhecimento: Set<string>;
    Desacordo: Set<string>;
    Estorno: Set<string>;
};

const extractNfeDataFromXml = (xmlContent: string, uploadSource: string) => {
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
        return null; // Not a relevant event
    }

    const infNFe = xmlDoc.getElementsByTagName('infNFe')[0];
    if(!infNFe) return null;

    const ide = infNFe.getElementsByTagName('ide')[0];
    
    // Check for Estorno based on natOp
    if (ide) {
        const natOp = getValue('natOp', ide);
        if (natOp.toLowerCase().includes('estorno')) {
             const chNFeEstorno = normalizeKey(infNFe.getAttribute('Id')) || '';
             return { isEvent: true, eventType: 'Estorno', key: chNFeEstorno, uploadSource };
        }
    }


    const emit = infNFe.getElementsByTagName('emit')[0];
    const dest = infNFe.getElementsByTagName('dest')[0];
    const total = infNFe.getElementsByTagName('ICMSTot')[0];
    const protNFe = xmlDoc.getElementsByTagName('protNFe')[0];

    if (!ide || !emit || !total ) return null;
    
    const infProt = protNFe ? protNFe.getElementsByTagName('infProt')[0] : null;
    const chNFe = normalizeKey(infProt ? getValue('chNFe', infProt) : (infNFe.getAttribute('Id') || '').replace('NFe',''));
    const cStat = infProt ? getValue('cStat', infProt) : '0';

    const numeroNF = getValue('nNF', ide);
    const isSaida = getValue('tpNF', ide) === '1';
    
    const firstItemCfop = infNFe.getElementsByTagName('det')[0]?.getElementsByTagName('prod')[0]?.getElementsByTagName('CFOP')[0]?.textContent || '';
    const isOwnEmissionDevolution = (uploadSource === 'entrada' && (firstItemCfop.startsWith('1') || firstItemCfop.startsWith('2')));


    const nota = {
        'Chave de acesso': chNFe,
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
        'isOwnEmissionDevolution': isOwnEmissionDevolution
    };


    const itens: any[] = [];
    const detElements = Array.from(infNFe.getElementsByTagName('det'));

    for (const det of detElements) {
        const prod = det.getElementsByTagName('prod')[0];
        const imposto = det.getElementsByTagName('imposto')[0];
        if (!prod || !imposto) continue;

        const icms = imposto.getElementsByTagName('ICMS')[0]?.firstElementChild; // gets ICMS00, ICMS60, etc.
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
            
            // Impostos
            'Valor Total Tributos': parseFloat(getValue('vTotTrib', imposto) || '0'),
            
            // ICMS
            'ICMS Origem': icms ? getValue('orig', icms) : '',
            'ICMS CST': icms ? getValue('CST', icms) : '',
            'ICMS Modalidade BC': icms ? getValue('modBC', icms) : '',
            'ICMS Base de Cálculo': icms ? parseFloat(getValue('vBC', icms) || '0') : 0,
            'ICMS Alíquota': icms ? parseFloat(getValue('pICMS', icms) || '0') : 0,
            'ICMS Valor': icms ? parseFloat(getValue('vICMS', icms) || '0') : 0,
            'ICMS vBCSTRet': icms ? parseFloat(getValue('vBCSTRet', icms) || '0') : 0,
            'ICMS pST': icms ? parseFloat(getValue('pST', icms) || '0') : 0,
            'ICMS vICMSSTRet': icms ? parseFloat(getValue('vICMSSTRet', icms) || '0') : 0,
            
            // IPI
            'IPI CST': ipi ? getValue('CST', ipi) : '',
            'IPI Base de Cálculo': ipi ? parseFloat(getValue('vBC', ipi) || '0') : 0,
            'IPI Alíquota': ipi ? parseFloat(getValue('pIPI', ipi) || '0') : 0,
            'IPI Valor': ipi ? parseFloat(getValue('vIPI', ipi) || '0') : 0,

            // PIS
            'PIS CST': pis ? getValue('CST', pis) : '',
            'PIS Base de Cálculo': pis ? parseFloat(getValue('vBC', pis) || '0') : 0,
            'PIS Alíquota': pis ? parseFloat(getValue('pPIS', pis) || '0') : 0,
            'PIS Valor': pis ? parseFloat(getValue('vPIS', pis) || '0') : 0,
            
            // COFINS
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
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
    const errorNode = xmlDoc.querySelector("parsererror");
    if (errorNode) {
      console.error("Error parsing XML:", errorNode.textContent);
      return null;
    }

    const getValue = (tag: string, context: Element | null) => context?.getElementsByTagName(tag)[0]?.textContent || '';
    
    // Check for CTe Event
    const eventoCTe = xmlDoc.getElementsByTagName('eventoCTe')[0];
    if (eventoCTe) {
        const infEvento = eventoCTe.getElementsByTagName('infEvento')[0];
        if (infEvento) {
            const chCTe = normalizeKey(getValue('chCTe', infEvento));
            const tpEvento = getValue('tpEvento', infEvento);

            // Prestação de Serviço em Desacordo
            if (tpEvento === '610110') {
                 return { isEvent: true, eventType: 'Desacordo', key: chCTe, uploadSource };
            }
        }
        return null; // Ignore other CTe events
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
        'uploadSource': uploadSource
    };

    return { nota };
}

export default function Home() {
    const {
      files,
      setFiles,
      spedFile,
      setSpedFile,
      results,
      setResults,
      keyCheckResults,
      setKeyCheckResult,
      spedInfo,
      setSpedInfo,
      activeTab,
      setActiveTab,
      clearAllData,
      detectedMonths,
      setDetectedMonths,
      setSelectedMonths,
    } = useContext(AppContext);

    const [processing, setProcessing] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isMonthModalOpen, setIsMonthModalOpen] = useState(false);
    const [tempSelectedMonths, setTempSelectedMonths] = useState<Set<string>>(new Set());
    const { toast } = useToast();
    

     const requiredFilesForStep1 = [
        "XMLs de Entrada (NFe)",
        "XMLs de Entrada (CTe)",
        "XMLs de Saída",
        "NF-Stock NFE Operação Não Realizada",
        "NF-Stock NFE Operação Desconhecida",
        "NF-Stock CTE Desacordo de Serviço",
    ];
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        const fileName = e.target.name;
        if (selectedFiles && selectedFiles.length > 0) {
            if (fileName === 'SPED TXT') {
                setSpedFile(selectedFiles[0]);
            } else {
                 setFiles(prev => ({
                    ...prev,
                    [fileName]: [...(prev[fileName] || []), ...Array.from(selectedFiles)]
                }));
            }
        }
    };

    const handleClearFile = (fileName: string) => {
        if (fileName === 'SPED TXT') {
            setSpedFile(null);
            const input = document.querySelector(`input[name="SPED TXT"]`) as HTMLInputElement;
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
                Estorno: new Set<string>(),
            }
            const canceledKeys = new Set<string>();

            const getMonthYear = (dateStr: string) => {
                if (!dateStr) return null;
                try { return format(parseISO(dateStr), "MM/yyyy"); } catch { return null; }
            };

            const processXmlFiles = async (fileList: File[], category: string) => {
                const type = category.includes('CTe') ? 'CTe' : 'NFe';
                const uploadSource = category.includes('Saída') ? 'saida' : 'entrada';
                
                for (const file of fileList) {
                   const fileContent = await file.text();
                   const xmlData = type === 'NFe' 
                       ? extractNfeDataFromXml(fileContent, uploadSource) 
                       : extractCteDataFromXml(fileContent, uploadSource);

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
                   if (!monthYear || !selectedMonths.has(monthYear)) continue;

                   if (xmlData.nota && xmlData.nota['Status']?.includes('Cancelada')) {
                        canceledKeys.add(xmlData.nota['Chave de acesso']);
                   }

                   if (type === 'NFe') allNfe.push(xmlData); else allCte.push(xmlData);

                   if(xmlData.itens){
                       if(uploadSource === 'entrada') allNfeItensEntrada.push(...xmlData.itens);
                       else allNfeItensSaida.push(...xmlData.itens);
                   }
               }
            };
            
            for (const category of Object.keys(files)) {
                const fileList = files[category];
                if (fileList && fileList.length > 0) {
                     if(category.includes('XML')) {
                        await processXmlFiles(fileList, category);
                     }
                }
            }


            const initialFrames = {
                'NF-Stock NFE': allNfe.filter(d => d.nota).map(d => d.nota),
                'NF-Stock CTE': allCte.filter(d => d.nota).map(d => d.nota),
                'Itens de Entrada': allNfeItensEntrada,
                'Itens de Saída': allNfeItensSaida,
                'NF-Stock Emitidas': [] 
            };
            
            const firstSpedLine = spedFile ? (await spedFile.text()).split('\n')[0]?.trim() || "" : "";
            const tempSpedInfo = parseSpedInfo(firstSpedLine);
            const companyCnpj = tempSpedInfo ? tempSpedInfo.cnpj : null;

            const processedData = processDataFrames(initialFrames, canceledKeys, exceptionKeys, companyCnpj);
            
            setResults(processedData);
            if (companyCnpj) {
                setSpedInfo(tempSpedInfo);
            }
            toast({ title: "Processamento Inicial Concluído", description: "Arquivos XML processados. Carregue o SPED para finalizar." });
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
             for (const file of fileList) {
                const fileContent = await file.text();
                const xmlData = type === 'NFe' ? extractNfeDataFromXml(fileContent, 'check') : extractCteDataFromXml(fileContent, 'check');
                if (xmlData?.nota) {
                    const monthYear = getMonthYear(xmlData.nota['Data de Emissão']);
                    if (monthYear) months.add(monthYear);
                }
            }
        };
        
        for(const category of Object.keys(files)) {
            const fileList = files[category];
            if(fileList && fileList.length > 0 && category.includes('XML')) {
                await checkFileDates(fileList, category);
            }
        }
        
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
        if (!spedFile) {
            toast({ variant: "destructive", title: "Arquivo SPED Ausente", description: "Por favor, carregue o arquivo SPED TXT." });
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
            const spedFileContent = await spedFile.text();
            
            const info = parseSpedInfo(spedFileContent.split('\n')[0]?.trim() || "");
            if (!info || !info.cnpj) {
                throw new Error("Não foi possível extrair o CNPJ da empresa do arquivo SPED. Verifique a primeira linha (|0000|).");
            }
            if (!spedInfo || spedInfo.cnpj !== info.cnpj) {
                setSpedInfo(info);
            }
            
            const validationResult = await validateWithSped(results, spedFileContent);

            if (validationResult.error) {
                throw new Error(validationResult.error);
            }

            setKeyCheckResult(validationResult.keyCheckResults || null);
            setSpedInfo(validationResult.spedInfo || info);
            
            toast({ title: "Validação SPED Concluída", description: "A verificação das chaves foi finalizada." });
        } catch (err: any) {
             setError(err.message || "Ocorreu um erro desconhecido na validação.");
             setKeyCheckResult(null);
             toast({ variant: "destructive", title: "Erro na Validação SPED", description: err.message });
        } finally {
            setValidating(false);
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
            };
            const orderedSheetNames = [
                "Notas Válidas", "Itens de Entrada", "Emissão Própria", "Itens de Saída", "Chaves Válidas", "Imobilizados", "Notas Canceladas",
                "Estornos", "NF-Stock NFE Operação Não Realizada", "NF-Stock NFE Operação Desconhecida", "NF-Stock CTE Desacordo de Serviço"
            ].filter(name => results[name] && results[name].length > 0);

            orderedSheetNames.forEach(sheetName => {
                const worksheet = XLSX.utils.json_to_sheet(results[sheetName]);
                if (results[sheetName].length > 0) {
                    worksheet['!cols'] = Object.keys(results[sheetName][0] || {}).map(() => ({ wch: 20 }));
                }
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
                                <DropdownMenuItem asChild>
                                    <Link href="/merger" className="flex items-center gap-2 w-full"><Group />Agrupador de Planilhas</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/sage-itens-nf" className="flex items-center gap-2 w-full"><FileTextIcon />Sage - Itens da NF</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/unify-folders" className="flex items-center gap-2 w-full"><FolderSync />Unificar Pastas</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/extract-nfe" className="flex items-center gap-2 w-full"><Search />Extrair NF-e</Link>
                                </DropdownMenuItem>
                                 <DropdownMenuItem asChild>
                                    <Link href="/extract-cte" className="flex items-center gap-2 w-full"><Search />Extrair CT-e</Link>
                                </DropdownMenuItem>
                                 <DropdownMenuItem asChild>
                                    <Link href="/returns" className="flex items-center gap-2 w-full"><FileText />Devoluções</Link>
                                </DropdownMenuItem>
                                 <DropdownMenuItem asChild>
                                    <Link href="/alterar-xml" className="flex items-center gap-2 w-full"><Replace />Alterar XML</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/separar-xml" className="flex items-center gap-2 w-full"><FileText />Separar XML</Link>
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
                                     {results && (
                                         <div className="flex flex-col gap-2 sm:flex-row">
                                            <Button onClick={handleDownload} className="w-full">
                                                <DownloadIcon className="mr-2"/> Baixar Planilha Processada
                                            </Button>
                                            <Button onClick={() => setActiveTab('validate')} className="w-full">
                                                Ir para Validação SPED
                                            </Button>
                                         </div>
                                    )}
                                </CardContent>
                            </Card>
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
                                    </CardHeader>
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
                            </CardHeader>
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
                                        <DownloadIcon className="mr-2"/>Baixar Planilha (.xlsx)
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
