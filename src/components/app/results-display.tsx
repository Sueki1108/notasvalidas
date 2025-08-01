"use client"

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DataTable } from '@/components/app/data-table';
import { getColumns } from '@/lib/columns-helper';
import { enhanceSpreadsheetWithInsights } from '@/ai/flows/enhance-with-insights';
import * as XLSX from 'xlsx';
import { BrainCircuit, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';


interface ResultsDisplayProps {
    results: Record<string, any[]>;
}

export function ResultsDisplay({ results }: ResultsDisplayProps) {
    const [activeTab, setActiveTab] = useState('');
    const [insights, setInsights] = useState<string | null>(null);
    const [isInsightModalOpen, setInsightModalOpen] = useState(false);
    const [isInsightLoading, setInsightLoading] = useState(false);
    const { toast } = useToast();

    const orderedSheetNames = [
        "Notas Válidas", "Itens Válidos", "Chaves Válidas",
        ...Object.keys(results).filter(name => !["Notas Válidas", "Itens Válidos", "Chaves Válidas"].includes(name))
    ];
    
    useEffect(() => {
        const storedTab = sessionStorage.getItem('activeTab');
        if (storedTab && orderedSheetNames.includes(storedTab)) {
            setActiveTab(storedTab);
        } else if (orderedSheetNames.length > 0) {
            // Find first valid sheet to set as active
            const firstValidSheet = orderedSheetNames.find(sheetName => results[sheetName] && results[sheetName].length > 0);
            setActiveTab(firstValidSheet || '');
        }
    }, [results]); // Re-run when results change

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        sessionStorage.setItem('activeTab', value);
    };

    const handleGetInsights = async () => {
        const dataForInsight = results[activeTab];
        if (!dataForInsight || dataForInsight.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Sem dados',
                description: 'Não há dados nesta aba para gerar insights.',
            });
            return;
        }

        setInsightLoading(true);
        setInsightModalOpen(true);
        try {
            const worksheet = XLSX.utils.json_to_sheet(dataForInsight);
            const csvData = XLSX.utils.sheet_to_csv(worksheet);
            const response = await enhanceSpreadsheetWithInsights({ spreadsheetData: csvData });
            setInsights(response.insights);
        } catch (error) {
            console.error('Error getting insights:', error);
            setInsights('Falha ao gerar insights. Por favor, tente novamente.');
            toast({
                variant: 'destructive',
                title: 'Erro de IA',
                description: 'Não foi possível gerar os insights.',
            });
        } finally {
            setInsightLoading(false);
        }
    };
    
    return (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className='flex-grow overflow-x-auto'>
                    <TabsList className="inline-flex h-auto">
                        {orderedSheetNames.map(sheetName => (
                            results[sheetName] && results[sheetName].length > 0 && <TabsTrigger key={sheetName} value={sheetName}>{sheetName}</TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                <div className="mt-2 sm:mt-0 sm:ml-4 flex-shrink-0">
                     <Button variant="outline" onClick={handleGetInsights} disabled={isInsightLoading}>
                        {isInsightLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                        Obter Insights com IA
                    </Button>
                </div>
            </div>
            {orderedSheetNames.map(sheetName => (
                results[sheetName] && results[sheetName].length > 0 && (
                    <TabsContent key={sheetName} value={sheetName}>
                        <DataTable columns={getColumns(results[sheetName])} data={results[sheetName]} />
                    </TabsContent>
                )
            ))}

            <AlertDialog open={isInsightModalOpen} onOpenChange={setInsightModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Insights de IA para "{activeTab}"</AlertDialogTitle>
                        <AlertDialogDescription>
                            {isInsightLoading ? 'Analisando dados...' : 'Aqui está uma análise rápida dos dados nesta aba.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {isInsightLoading ? (
                        <div className="flex justify-center items-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="max-h-80 overflow-y-auto rounded-md border bg-secondary/50 p-4">
                            <p className="text-sm">{insights}</p>
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => setInsightModalOpen(false)}>Fechar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Tabs>
    );
}
