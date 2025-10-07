// src/context/AppContext.tsx
"use client";

import React, { createContext, useState, ReactNode } from 'react';
import type { KeyCheckResult, SpedInfo } from "@/app/actions";
import { FileList } from '@/components/app/file-upload-form';

type DataFrames = { [key: string]: any[] };

interface AppContextType {
    files: FileList;
    setFiles: React.Dispatch<React.SetStateAction<FileList>>;
    spedFile: File | null;
    setSpedFile: React.Dispatch<React.SetStateAction<File | null>>;
    results: DataFrames | null;
    setResults: React.Dispatch<React.SetStateAction<DataFrames | null>>;
    keyCheckResults: KeyCheckResult | null;
    setKeyCheckResult: React.Dispatch<React.SetStateAction<KeyCheckResult | null>>;
    spedInfo: SpedInfo | null;
    setSpedInfo: React.Dispatch<React.SetStateAction<SpedInfo | null>>;
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
    "NF-Stock NFE Operação Não Realizada": null,
    "NF-Stock NFE Operação Desconhecida": null,
    "NF-Stock CTE Desacordo de Serviço": null,
};

export const AppContext = createContext<AppContextType>({
    files: initialFilesState,
    setFiles: () => {},
    spedFile: null,
    setSpedFile: () => {},
    results: null,
    setResults: () => {},
    keyCheckResults: null,
    setKeyCheckResult: () => {},
    spedInfo: null,
    setSpedInfo: () => {},
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
    const [spedFile, setSpedFile] = useState<File | null>(null);
    const [results, setResults] = useState<DataFrames | null>(null);
    const [keyCheckResults, setKeyCheckResult] = useState<KeyCheckResult | null>(null);
    const [spedInfo, setSpedInfo] = useState<SpedInfo | null>(null);
    const [activeTab, setActiveTab] = useState('process');
    const [detectedMonths, setDetectedMonths] = useState<string[]>([]);
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());

    const clearAllData = () => {
        setFiles(initialFilesState);
        setSpedFile(null);
        setResults(null);
        setKeyCheckResult(null);
        setSpedInfo(null);
        setActiveTab("process");
        setDetectedMonths([]);
        setSelectedMonths(new Set());
        
        const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
        inputs.forEach(input => input.value = "");
    };

    return (
        <AppContext.Provider value={{ 
            files, setFiles, 
            spedFile, setSpedFile, 
            results, setResults, 
            keyCheckResults, setKeyCheckResult,
            spedInfo, setSpedInfo,
            activeTab, setActiveTab,
            clearAllData,
            detectedMonths, setDetectedMonths,
            selectedMonths, setSelectedMonths
        }}>
            {children}
        </AppContext.Provider>
    );
};
