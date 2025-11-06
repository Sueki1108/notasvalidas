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
        XLSX.writeFile(workbook, filename);
        toast({ title: "Download Iniciado", description: `O arquivo ${filename} está sendo baixado.` });
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
                        Baixar
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
    result: CfopComparisonResult;
}

export function CfopResultsDisplay({ result }: CfopResultsDisplayProps) {
    return (
        <div className="space-y-8">
            <CfopResultTable
                title="Itens Conciliados"
                description="Itens encontrados tanto nos XMLs quanto na planilha de referência."
                data={result.foundInBoth || []}
                filename="cfop_conciliados.ods"
            />
            <CfopResultTable
                title="Itens Apenas nos XMLs"
                description="Itens que existem nos arquivos XML mas não foram encontrados na planilha de referência."
                data={result.onlyInXml || []}
                filename="cfop_apenas_xml.ods"
            />
            <CfopResultTable
                title="Itens Apenas na Planilha"
                description="Itens que existem na planilha de referência mas não foram encontrados nos arquivos XML."
                data={result.onlyInSheet || []}
                filename="cfop_apenas_planilha.ods"
            />
        </div>
    );
}
