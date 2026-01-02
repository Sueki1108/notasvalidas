"use client"

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from '@/components/app/data-table';
import { getColumns } from '@/lib/columns-helper';
import * as XLSX from 'xlsx';

interface ResultsDisplayProps {
    results: Record<string, any[]>;
}

export function ResultsDisplay({ results }: ResultsDisplayProps) {
    const [activeTab, setActiveTab] = useState('');

    const orderedSheetNames = [
        "Notas Válidas", "Itens de Entrada", "Emissão Própria", "Itens de Saída", "Chaves Válidas", "Imobilizados",
        "Notas Canceladas", "NF-Stock NFE Operação Não Realizada", "NF-Stock NFE Operação Desconhecida", "NF-Stock CTE Desacordo de Serviço",
        "Chaves Encontradas no SPED"
    ].filter(name => results[name] && results[name].length > 0);
    
    useEffect(() => {
        // Find first valid sheet to set as active
        const firstValidSheet = orderedSheetNames.find(sheetName => results[sheetName] && results[sheetName].length > 0);
        setActiveTab(firstValidSheet || '');
    }, [results]); // Re-run when results change

    const handleTabChange = (value: string) => {
        setActiveTab(value);
    };
    
    return (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className='flex-grow overflow-x-auto'>
                    <TabsList className="inline-flex h-auto">
                        {orderedSheetNames.map(sheetName => (
                           <TabsTrigger key={sheetName} value={sheetName}>{sheetName}</TabsTrigger>
                        ))}
                    </TabsList>
                </div>
            </div>
            {orderedSheetNames.map(sheetName => (
                results[sheetName] && results[sheetName].length > 0 && (
                    <TabsContent key={sheetName} value={sheetName}>
                        <DataTable columns={getColumns(results[sheetName])} data={results[sheetName]} />
                    </TabsContent>
                )
            ))}
        </Tabs>
    );
}
