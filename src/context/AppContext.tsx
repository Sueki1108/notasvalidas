// src/context/AppContext.tsx
"use client";

import React, { createContext, useState, ReactNode } from 'react';
import type { KeyCheckResult, SpedInfo, CfopComparisonResult, CfopAccountingComparisonResult } from "@/app/actions";
import { FileList } from '@/components/app/file-upload-form';

type DataFrames = { [key: string]: any[] };

export type TaxFileList = {
    "Planilha ICMS": File | null;
    "Planilha ICMS ST": File | null;
    "Planilha PIS": File | null;
    "Planilha COFINS": File | null;
    "Planilha IPI": File | null;
}

interface AppContextType {
    files: FileList;
    setFiles: React.Dispatch<React.SetStateAction<FileList>>;
    spedFiles: File[] | null;
    setSpedFiles: React.Dispatch<React.SetStateAction<File[] | null>>;
    taxFiles: TaxFileList;
    setTaxFiles: React.Dispatch<React.SetStateAction<TaxFileList>>;
    accountingFile: File | null;
    setAccountingFile: React.Dispatch<React.SetStateAction<File | null>>;
    results: DataFrames | null;
    setResults: React.Dispatch<React.SetStateAction<DataFrames | null>>;
    keyCheckResults: KeyCheckResult | null;
    setKeyCheckResult: React.Dispatch<React.SetStateAction<KeyCheckResult | null>>;
    spedInfo: SpedInfo | null;
    setSpedInfo: React.Dispatch<React.SetStateAction<SpedInfo | null>>;
    cfopComparisonResult: CfopComparisonResult | null;
    setCfopComparisonResult: React.Dispatch<React.SetStateAction<CfopComparisonResult | null>>;
    cfopAccountingResult: CfopAccountingComparisonResult | null;
    setCfopAccountingResult: React.Dispatch<React.SetStateAction<CfopAccountingComparisonResult | null>>;
    activeTab: string;
    setActiveTab: React.Dispatch<React.SetStateAction<string>>;
    clearAllData: () => void;
    detectedMonths: string[];
    setDetectedMonths: React.Dispatch<React.SetStateAction<string[]>>;
    selectedMonths: Set<string>;
    setSelectedMonths: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const initialFilesState: FileList = {
    "XMLs de Entrada (NFe)": null,
    "XMLs de Entrada (CTe)": null,
    "XMLs de Saída": null,
    "XMLs de Operação Não Realizada": null,
    "XMLs de Desconhecimento do Destinatário": null,
    "XMLs de Desacordo (CTe)": null,
};

const initialTaxFilesState: TaxFileList = {
    "Planilha ICMS": null,
    "Planilha ICMS ST": null,
    "Planilha PIS": null,
    "Planilha COFINS": null,
    "Planilha IPI": null,
}

export const AppContext = createContext<AppContextType>({
    files: initialFilesState,
    setFiles: () => {},
    spedFiles: null,
    setSpedFiles: () => {},
    taxFiles: initialTaxFilesState,
    setTaxFiles: () => {},
    accountingFile: null,
    setAccountingFile: () => {},
    results: null,
    setResults: () => {},
    keyCheckResults: null,
    setKeyCheckResult: () => {},
    spedInfo: null,
    setSpedInfo: () => {},
    cfopComparisonResult: null,
    setCfopComparisonResult: () => {},
    cfopAccountingResult: null,
    setCfopAccountingResult: () => {},
    activeTab: 'process',
    setActiveTab: () => {},
    clearAllData: () => {},
    detectedMonths: [],
    setDetectedMonths: () => {},
    selectedMonths: new Set(),
    setSelectedMonths: () => {},
});

export const AppProvider = ({ children }: { children: ReactNode }) => {
    const [files, setFiles] = useState<FileList>(initialFilesState);
    const [spedFiles, setSpedFiles] = useState<File[] | null>(null);
    const [taxFiles, setTaxFiles] = useState<TaxFileList>(initialTaxFilesState);
    const [accountingFile, setAccountingFile] = useState<File | null>(null);
    const [results, setResults] = useState<DataFrames | null>(null);
    const [keyCheckResults, setKeyCheckResult] = useState<KeyCheckResult | null>(null);
    const [spedInfo, setSpedInfo] = useState<SpedInfo | null>(null);
    const [cfopComparisonResult, setCfopComparisonResult] = useState<CfopComparisonResult | null>(null);
    const [cfopAccountingResult, setCfopAccountingResult] = useState<CfopAccountingComparisonResult | null>(null);
    const [activeTab, setActiveTab] = useState('process');
    const [detectedMonths, setDetectedMonths] = useState<string[]>([]);
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());

    const clearAllData = () => {
        setFiles(initialFilesState);
        setSpedFiles(null);
        setTaxFiles(initialTaxFilesState);
        setAccountingFile(null);
        setResults(null);
        setKeyCheckResult(null);
        setSpedInfo(null);
        setCfopComparisonResult(null);
        setCfopAccountingResult(null);
        setActiveTab("process");
        setDetectedMonths([]);
        setSelectedMonths(new Set());
        
        const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
        inputs.forEach(input => input.value = "");
    };

    return (
        <AppContext.Provider value={{ 
            files, setFiles, 
            spedFiles, setSpedFiles, 
            taxFiles, setTaxFiles,
            accountingFile, setAccountingFile,
            results, setResults, 
            keyCheckResults, setKeyCheckResult,
            spedInfo, setSpedInfo,
            cfopComparisonResult, setCfopComparisonResult,
            cfopAccountingResult, setCfopAccountingResult,
            activeTab, setActiveTab,
            clearAllData,
            detectedMonths, setDetectedMonths,
            selectedMonths, setSelectedMonths
        }}>
            {children}
        </AppContext.Provider>
    );
};
