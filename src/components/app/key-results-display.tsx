// src/components/app/key-results-display.tsx
"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, CheckCircle, XCircle, Download, Ban, Circle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { KeyCheckResult } from "@/app/key-checker/page";

interface KeyResultsDisplayProps {
    results: KeyCheckResult;
}

const KeyItem = ({ nfeKey, isDuplicate }: { nfeKey: string, isDuplicate: boolean }) => {
    const { toast } = useToast();
    const [status, setStatus] = useState<'default' | 'checked' | 'cancelled'>('default');

    const copyToClipboard = (text: string, type: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: `${type} copiad${type.endsWith('a') ? 'a' : 'o'}`, description: text });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar ${type}` });
        });
    };

    const extractInvoiceNumber = (key: string): string => {
        if (key.length === 44 && /^\d+$/.test(key.substring(25, 34))) {
            return String(parseInt(key.substring(25, 34), 10));
        }
        return "N/A";
    };

    const identifyInvoiceModel = (key: string): 'NFE' | 'CTE' | '?' => {
        if (key.length === 44 && /^\d+$/.test(key.substring(20, 22))) {
            const modelCode = key.substring(20, 22);
            if (modelCode === '55') return 'NFE';
            if (modelCode === '57') return 'CTE';
        }
        return '?';
    };
    
    const invoiceNumber = extractInvoiceNumber(nfeKey);
    const invoiceModel = identifyInvoiceModel(nfeKey);

    const getStatusClasses = () => {
        if (status === 'checked') return 'bg-green-100 border-green-300';
        if (status === 'cancelled') return 'bg-red-100 border-red-300';
        return 'bg-secondary/50';
    }

    const toggleStatus = (newStatus: 'checked' | 'cancelled') => {
        setStatus(prev => prev === newStatus ? 'default' : newStatus);
    }

    return (
        <div className={`p-3 rounded-lg border flex flex-col gap-4 transition-colors ${getStatusClasses()}`}>
            <div className="flex-grow font-mono text-sm break-all">
                <div className="flex items-center gap-2 mb-1">
                     <span
                        className={`px-2 py-1 text-xs font-bold text-white rounded-md ${invoiceModel === 'NFE' ? 'bg-emerald-500' : invoiceModel === 'CTE' ? 'bg-amber-500' : 'bg-gray-500'}`}
                    >
                        {invoiceModel}
                    </span>
                    <span>{nfeKey}</span>
                </div>
                 {isDuplicate && (
                    <div className="flex items-center gap-1 text-xs text-amber-700 font-semibold">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Possível duplicidade</span>
                    </div>
                )}
            </div>
            <div className="flex-shrink-0 flex items-center flex-wrap gap-2">
                 <div className="text-sm font-mono flex items-center gap-2 bg-gray-200 px-2 py-1 rounded">
                    <span>NF: {invoiceNumber}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(invoiceNumber, 'Número da NF')}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyToClipboard(nfeKey, 'Chave')}>
                    <Copy className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleStatus('checked')}>
                    {status === 'checked' ? <CheckCircle className="h-5 w-5 text-green-600"/> : <Circle className="h-5 w-5 text-gray-400"/>}
                </Button>
                 <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleStatus('cancelled')}>
                    {status === 'cancelled' ? <XCircle className="h-5 w-5 text-red-600"/> : <Ban className="h-5 w-5 text-gray-400"/>}
                </Button>
            </div>
        </div>
    );
};

export function KeyResultsDisplay({ results }: KeyResultsDisplayProps) {
    const { toast } = useToast();
    const duplicateSheetKeys = new Set(results.duplicateKeysInSheet || []);
    const duplicateTxtKeys = new Set(results.duplicateKeysInTxt || []);

    const handleDownload = (keys: string[], filename: string) => {
        if (keys.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Nenhum dado para baixar',
                description: `Não há chaves na lista para o arquivo ${filename}.`
            });
            return;
        }
        const data = keys.map(key => ({ "Chave de acesso": key }));
        const worksheet = XLSX.utils.json_to_sheet(data);
        // Basic autofit - set widths
        worksheet['!cols'] = [{ wch: 50 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Chaves");
        XLSX.writeFile(workbook, filename);
        toast({ title: "Download Iniciado", description: `O arquivo ${filename} está sendo baixado.` });
    };

    return (
        <div className="space-y-8">
            <Card className="shadow-lg">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <CardTitle className="font-headline text-2xl text-red-700">Chaves da Planilha NÃO ENCONTRADAS no Texto</CardTitle>
                            <CardDescription>Estas chaves estavam na sua planilha mas não no arquivo .txt.</CardDescription>
                        </div>
                        <Button onClick={() => handleDownload(results.keysNotFoundInTxt, "chaves_planilha_nao_encontradas.xlsx")} disabled={results.keysNotFoundInTxt.length === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            Baixar XLSX
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    {results.keysNotFoundInTxt.length > 0 ? (
                        results.keysNotFoundInTxt.map(key => <KeyItem key={key} nfeKey={key} isDuplicate={duplicateSheetKeys.has(key)} />)
                    ) : (
                        <p className="text-muted-foreground italic">Boas notícias! Todas as chaves da planilha foram encontradas no arquivo de texto.</p>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                 <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <CardTitle className="font-headline text-2xl text-blue-700">Chaves do Texto NÃO ENCONTRADAS na Planilha</CardTitle>
                            <CardDescription>Estas chaves estavam no seu arquivo .txt mas não na planilha.</CardDescription>
                        </div>
                        <Button onClick={() => handleDownload(results.keysInTxtNotInSheet, "chaves_txt_nao_encontradas.xlsx")} disabled={results.keysInTxtNotInSheet.length === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            Baixar XLSX
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    {results.keysInTxtNotInSheet.length > 0 ? (
                        results.keysInTxtNotInSheet.map(key => <KeyItem key={key} nfeKey={key} isDuplicate={duplicateTxtKeys.has(key)} />)
                    ) : (
                        <p className="text-muted-foreground italic">Boas notícias! Todas as chaves do arquivo de texto foram encontradas na sua planilha.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
