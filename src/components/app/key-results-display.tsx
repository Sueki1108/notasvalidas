// src/components/app/key-results-display.tsx
"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Download, Ban, Circle, AlertTriangle, MessageSquare, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addOrUpdateKeyComment } from "@/app/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type KeyCheckResult = {
    keysNotFoundInTxt: string[];
    keysInTxtNotInSheet: string[];
    duplicateKeysInSheet: string[];
    duplicateKeysInTxt: string[];
};

interface KeyItemProps {
    nfeKey: string;
    isDuplicate: boolean;
    cnpj: string | null;
    origin: 'sheet' | 'txt';
}

const KeyItem = ({ nfeKey, isDuplicate, cnpj, origin }: KeyItemProps) => {
    const { toast } = useToast();
    const [comment, setComment] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const copyToClipboard = (text: string, type: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: `${type} copiad${type.endsWith('a') ? 'a' : 'o'}`, description: text });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar ${type}` });
        });
    };

    const handleSaveComment = async () => {
        if (!cnpj) {
            toast({ variant: 'destructive', title: 'CNPJ não encontrado', description: 'Não é possível salvar comentários sem um CNPJ.' });
            return;
        }
        setIsSaving(true);
        try {
            const result = await addOrUpdateKeyComment(cnpj, nfeKey, comment);
            if (result.error) {
                throw new Error(result.error);
            }
            toast({ title: 'Sucesso', description: result.message });
            setIsPopoverOpen(false);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro ao Salvar', description: error.message });
        } finally {
            setIsSaving(false);
        }
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
    
    const displayKey = nfeKey.replace(/^NFe|^CTe/, '');
    const invoiceNumber = extractInvoiceNumber(displayKey);
    const invoiceModel = identifyInvoiceModel(displayKey);

    return (
        <div className={`p-3 rounded-lg border flex flex-col gap-4 transition-colors bg-secondary/50`}>
            <div className="flex-grow font-mono text-sm break-all">
                <div className="flex items-center gap-2 mb-1">
                     <span
                        className={`px-2 py-1 text-xs font-bold text-white rounded-md ${invoiceModel === 'NFE' ? 'bg-emerald-500' : invoiceModel === 'CTE' ? 'bg-amber-500' : 'bg-gray-500'}`}
                    >
                        {invoiceModel}
                    </span>
                    <span>{displayKey}</span>
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
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyToClipboard(displayKey, 'Chave')}>
                    <Copy className="h-4 w-4" />
                </Button>
                
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                         <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!cnpj}>
                            <MessageSquare className="h-5 w-5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <h4 className="font-medium leading-none">Adicionar Comentário</h4>
                                <p className="text-sm text-muted-foreground">
                                   Adicione uma anotação a esta chave.
                                </p>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="comment">Comentário</Label>
                                <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
                            </div>
                            <Button onClick={handleSaveComment} disabled={isSaving}>
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                Salvar
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>

            </div>
        </div>
    );
};

interface KeyResultsDisplayProps {
    results: KeyCheckResult;
    cnpj: string | null;
}

export function KeyResultsDisplay({ results, cnpj }: KeyResultsDisplayProps) {
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
        const data = keys.map(key => ({ "Chave de acesso": key.replace(/^NFe|^CTe/, '') }));
        const worksheet = XLSX.utils.json_to_sheet(data);
        worksheet['!cols'] = [{ wch: 50 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Chaves");
        XLSX.writeFile(workbook, filename);
        toast({ title: "Download Iniciado", description: `O arquivo ${filename} está sendo baixado.` });
    };

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <CardTitle className="font-headline text-xl text-red-700">Chaves da Planilha NÃO ENCONTRADAS no SPED</CardTitle>
                            <CardDescription>Estas chaves estavam em suas planilhas/XMLs mas não no arquivo SPED TXT.</CardDescription>
                        </div>
                        <Button onClick={() => handleDownload(results.keysNotFoundInTxt, "chaves_nao_encontradas_no_sped.xlsx")} disabled={!results.keysNotFoundInTxt || results.keysNotFoundInTxt.length === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            Baixar
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2 max-h-96 overflow-y-auto pr-3">
                    {results.keysNotFoundInTxt && results.keysNotFoundInTxt.length > 0 ? (
                        results.keysNotFoundInTxt.map(key => <KeyItem key={key} nfeKey={key} isDuplicate={duplicateSheetKeys.has(key)} cnpj={cnpj} origin="sheet" />)
                    ) : (
                        <p className="text-muted-foreground italic">Nenhuma divergência encontrada.</p>
                    )}
                </CardContent>
            </Card>

            <Card>
                 <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <CardTitle className="font-headline text-xl text-blue-700">Chaves do SPED NÃO ENCONTRADAS na Planilha</CardTitle>
                            <CardDescription>Estas chaves estavam no seu arquivo SPED TXT mas não nas planilhas/XMLs.</CardDescription>
                        </div>
                        <Button onClick={() => handleDownload(results.keysInTxtNotInSheet, "chaves_apenas_no_sped.xlsx")} disabled={!results.keysInTxtNotInSheet || results.keysInTxtNotInSheet.length === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            Baixar
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2 max-h-96 overflow-y-auto pr-3">
                    {results.keysInTxtNotInSheet && results.keysInTxtNotInSheet.length > 0 ? (
                        results.keysInTxtNotInSheet.map(key => <KeyItem key={key} nfeKey={key} isDuplicate={duplicateTxtKeys.has(key)} cnpj={cnpj} origin="txt" />)
                    ) : (
                        <p className="text-muted-foreground italic">Nenhuma divergência encontrada.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
