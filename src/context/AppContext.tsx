// src/context/AppContext.tsx
"use client";

import React, { createContext, useState, ReactNode } from 'react';
import type { KeyCheckResult, SpedInfo, CfopComparisonResult, CfopAccountingComparisonResult } from "@/app/actions";

type DataFrames = { [key: string]: any[] };

export type FileList = {
    [key: string]: File[] | File | null;
}

export type TaxFileList = {
    "Planilha ICMS": File | null;
    "Planilha ICMS ST": File | null;
    "Planilha PIS": File | null;
    "Planilha COFINS": File | null;
    "Planilha IPI": File | null;
}

export type CteAnalysisResult = {
    cteRemetente: any[];
    cteDestinatario: any[];
} | null;


interface AppContextType {
    files: FileList;
    setFiles: React.Dispatch<React.SetStateAction<FileList>>;
    spedFiles: File[] | null;
    setSpedFiles: React.Dispatch<React.SetStateAction<File[] | null>>;
    accountingFile: File | null;
    setAccountingFile: React.Dispatch<React.SetStateAction<File | null>>;
    results: DataFrames | null;
    setResults: React.Dispatch<React.SetStateAction<DataFrames | null>>;
    keyCheckResults: KeyCheckResult | null;
    setKeyCheckResult: React.Dispatch<React.SetStateAction<KeyCheckResult | null>>;
    spedInfo: SpedInfo | null;
    setSpedInfo: React.Dispatch<React.SetStateAction<SpedInfo | null>>;
    cfopAccountingResult: CfopAccountingComparisonResult | null;
    setCfopAccountingResult: React.Dispatch<React.SetStateAction<CfopAccountingComparisonResult | null>>;
    cteAnalysisResult: CteAnalysisResult;
    setCteAnalysisResult: React.Dispatch<React.SetStateAction<CteAnalysisResult>>;
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


export const AppContext = createContext<AppContextType>({
    files: initialFilesState,
    setFiles: () => {},
    spedFiles: null,
    setSpedFiles: () => {},
    accountingFile: null,
    setAccountingFile: () => {},
    results: null,
    setResults: () => {},
    keyCheckResults: null,
    setKeyCheckResult: () => {},
    spedInfo: null,
    setSpedInfo: () => {},
    cfopAccountingResult: null,
    setCfopAccountingResult: () => {},
    cteAnalysisResult: null,
    setCteAnalysisResult: () => {},
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
    const [accountingFile, setAccountingFile] = useState<File | null>(null);
    const [results, setResults] = useState<DataFrames | null>(null);
    const [keyCheckResults, setKeyCheckResult] = useState<KeyCheckResult | null>(null);
    const [spedInfo, setSpedInfo] = useState<SpedInfo | null>(null);
    const [cfopAccountingResult, setCfopAccountingResult] = useState<CfopAccountingComparisonResult | null>(null);
    const [cteAnalysisResult, setCteAnalysisResult] = useState<CteAnalysisResult>(null);
    const [activeTab, setActiveTab] = useState('process');
    const [detectedMonths, setDetectedMonths] = useState<string[]>([]);
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());

    const clearAllData = () => {
        setFiles(initialFilesState);
        setSpedFiles(null);
        setAccountingFile(null);
        setResults(null);
        setKeyCheckResult(null);
        setSpedInfo(null);
        setCfopAccountingResult(null);
        setCteAnalysisResult(null);
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
            accountingFile, setAccountingFile,
            results, setResults, 
            keyCheckResults, setKeyCheckResult,
            spedInfo, setSpedInfo,
            cfopAccountingResult, setCfopAccountingResult,
            cteAnalysisResult, setCteAnalysisResult,
            activeTab, setActiveTab,
            clearAllData,
            detectedMonths, setDetectedMonths,
            selectedMonths, setSelectedMonths
        }}>
            {children}
        </AppContext.Provider>
    );
};
