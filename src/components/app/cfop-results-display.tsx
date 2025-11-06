// src/components/app/cfop-results-display.tsx
"use client";

import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CfopComparisonResult } from "@/app/actions";
import { DataTable } from "./data-table";
import { getColumns } from "@/lib/columns-helper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";


interface CfopResultTableProps {
    title: string;
    description: string;
    data: any[];
    filename: string;
}

const CfopResultTable = ({ title, description, data, filename }: CfopResultTableProps) => {
    const { toast } = useToast();
    
    const handleDownload = () => {
        if (data.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Nenhum dado para baixar',
                description: `Não há itens na lista para o arquivo ${filename}.`
            });
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");

        // Use 'ods' format for better compatibility with open-source tools
        const output_filename = filename.endsWith('.ods') ? filename : `${filename}.ods`;
        XLSX.writeFile(workbook, output_filename, { bookType: "ods" });

        toast({ title: "Download Iniciado", description: `O arquivo ${output_filename} está sendo baixado.` });
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle className="font-headline text-xl">{title} ({data.length})</CardTitle>
                        <CardDescription>{description}</CardDescription>
                    </div>
                    <Button onClick={handleDownload} disabled={data.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Baixar (.ods)
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {data.length > 0 ? (
                     <DataTable columns={getColumns(data)} data={data} />
                ) : (
                    <p className="text-muted-foreground italic p-4 text-center">Nenhum item encontrado nesta categoria.</p>
                )}
            </CardContent>
        </Card>
    );
};

interface CfopResultsDisplayProps {
    results: CfopComparisonResult;
}

export function CfopResultsDisplay({ results }: CfopResultsDisplayProps) {
    const taxTypes = Object.keys(results);
    const [activeTab, setActiveTab] = useState(taxTypes[0] || '');

    useEffect(() => {
        if (taxTypes.length > 0 && !taxTypes.includes(activeTab)) {
            setActiveTab(taxTypes[0]);
        }
    }, [taxTypes, activeTab]);

    if(taxTypes.length === 0) {
        return <p>Nenhum resultado de comparação para exibir.</p>
    }

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
                {taxTypes.map(taxName => (
                    <TabsTrigger key={taxName} value={taxName}>{taxName.replace('Planilha ', '')}</TabsTrigger>
                ))}
            </TabsList>

            {taxTypes.map(taxName => {
                const result = results[taxName];
                return (
                    <TabsContent key={taxName} value={taxName} className="mt-4 space-y-8">
                         <CfopResultTable
                            title="Itens Conciliados"
                            description="Itens encontrados tanto nos XMLs quanto na planilha de referência."
                            data={result?.foundInBoth || []}
                            filename={`conciliados_${taxName.replace(' ', '_')}.ods`}
                        />
                        <CfopResultTable
                            title="Itens Apenas nos XMLs"
                            description="Itens que existem nos arquivos XML mas não foram encontrados na planilha de referência."
                            data={result?.onlyInXml || []}
                            filename={`apenas_xml_${taxName.replace(' ', '_')}.ods`}
                        />
                        <CfopResultTable
                            title="Itens Apenas na Planilha"
                            description="Itens que existem na planilha de referência mas não foram encontrados nos arquivos XML."
                            data={result?.onlyInSheet || []}
                            filename={`apenas_planilha_${taxName.replace(' ', '_')}.ods`}
                        />
                    </TabsContent>
                )
            })}
        </Tabs>
    );
}
