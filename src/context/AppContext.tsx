// src/context/AppContext.tsx
"use client";

import React, { createContext, useState, ReactNode } from 'react';
import type { KeyCheckResult, SpedInfo, CfopComparisonResult } from "@/app/actions";
import { FileList } from '@/components/app/file-upload-form';

type DataFrames = { [key: string]: any[] };

interface AppContextType {
    files: FileList;
    setFiles: React.Dispatch<React.SetStateAction<FileList>>;
    spedFiles: File[] | null;
    setSpedFiles: React.Dispatch<React.SetStateAction<File[] | null>>;
    cfopFile: File | null;
    setCfopFile: React.Dispatch<React.SetStateAction<File | null>>;
    results: DataFrames | null;
    setResults: React.Dispatch<React.SetStateAction<DataFrames | null>>;
    keyCheckResults: KeyCheckResult | null;
    setKeyCheckResult: React.Dispatch<React.SetStateAction<KeyCheckResult | null>>;
    spedInfo: SpedInfo | null;
    setSpedInfo: React.Dispatch<React.SetStateAction<SpedInfo | null>>;
    cfopComparisonResult: CfopComparisonResult | null;
    setCfopComparisonResult: React.Dispatch<React.SetStateAction<CfopComparisonResult | null>>;
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
    "XMLs de Estorno": null,
};

export const AppContext = createContext<AppContextType>({
    files: initialFilesState,
    setFiles: () => {},
    spedFiles: null,
    setSpedFiles: () => {},
    cfopFile: null,
    setCfopFile: () => {},
    results: null,
    setResults: () => {},
    keyCheckResults: null,
    setKeyCheckResult: () => {},
    spedInfo: null,
    setSpedInfo: () => {},
    cfopComparisonResult: null,
    setCfopComparisonResult: () => {},
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
    const [cfopFile, setCfopFile] = useState<File | null>(null);
    const [results, setResults] = useState<DataFrames | null>(null);
    const [keyCheckResults, setKeyCheckResult] = useState<KeyCheckResult | null>(null);
    const [spedInfo, setSpedInfo] = useState<SpedInfo | null>(null);
    const [cfopComparisonResult, setCfopComparisonResult] = useState<CfopComparisonResult | null>(null);
    const [activeTab, setActiveTab] = useState('process');
    const [detectedMonths, setDetectedMonths] = useState<string[]>([]);
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());

    const clearAllData = () => {
        setFiles(initialFilesState);
        setSpedFiles(null);
        setCfopFile(null);
        setResults(null);
        setKeyCheckResult(null);
        setSpedInfo(null);
        setCfopComparisonResult(null);
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
            cfopFile, setCfopFile,
            results, setResults, 
            keyCheckResults, setKeyCheckResult,
            spedInfo, setSpedInfo,
            cfopComparisonResult, setCfopComparisonResult,
            activeTab, setActiveTab,
            clearAllData,
            detectedMonths, setDetectedMonths,
            selectedMonths, setSelectedMonths
        }}>
            {children}
        </AppContext.Provider>
    );
};
