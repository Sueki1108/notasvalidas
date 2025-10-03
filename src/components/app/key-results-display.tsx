// src/components/app/key-results-display.tsx
"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Download, MessageSquare, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addOrUpdateKeyComment } from "@/app/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KeyCheckResult, KeyInfo } from "@/app/actions";
import { Badge } from "@/components/ui/badge";

const normalizeKey = (key: any): string => {
    if (!key) return '';
    return String(key).replace(/\D/g, '').trim();
}

interface KeyItemRowProps {
    item: KeyInfo;
    cnpj: string | null;
}

const KeyItemRow = ({ item, cnpj }: KeyItemRowProps) => {
    const { toast } = useToast();
    const [comment, setComment] = useState(item.comment || '');
    const [isSaving, setIsSaving] = useState(false);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const copyToClipboard = (text: string, type: string) => {
        if (!text) return;
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
            const result = await addOrUpdateKeyComment(cnpj, item.key, comment);
            if (result.error) throw new Error(result.error);
            toast({ title: 'Sucesso', description: result.message });
            setIsPopoverOpen(false);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro ao Salvar', description: error.message });
        } finally {
            setIsSaving(false);
        }
    };
    
    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return 'N/A';
        // Handle YYYY-MM-DDTHH:MM:SS-HH:MM format
        if (dateStr.includes('T')) {
            return new Date(dateStr).toLocaleDateString('pt-BR');
        }
        // Handle DDMMYYYY format
        if (dateStr.length === 8 && /^\d+$/.test(dateStr)) {
            return `${dateStr.substring(0, 2)}/${dateStr.substring(2, 4)}/${dateStr.substring(4, 8)}`;
        }
        return dateStr;
    }

    return (
        <TableRow>
            <TableCell className="font-mono text-xs break-all">
                {item.key}
                <Button size="icon" variant="ghost" className="h-6 w-6 ml-2" onClick={() => copyToClipboard(item.key, 'Chave')}>
                    <Copy className="h-3 w-3" />
                </Button>
            </TableCell>
            <TableCell>
                <Badge variant={item.docType === 'NFe' ? 'default' : 'secondary'}>{item.docType || 'N/A'}</Badge>
            </TableCell>
            <TableCell>
                <Badge variant={item.direction === 'Entrada' ? 'outline' : 'default'} className={item.direction === 'Entrada' ? 'border-blue-500 text-blue-500' : 'bg-orange-500'}>
                    {item.direction || 'N/A'}
                </Badge>
            </TableCell>
            <TableCell>{item.partnerName || 'N/A'}</TableCell>
            <TableCell>{formatDate(item.emissionDate)}</TableCell>
            <TableCell className="text-right">
                {item.value ? item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'N/A'}
            </TableCell>
            <TableCell className="text-center">
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                         <Button size="icon" variant={comment ? "default" : "ghost"} className="h-8 w-8" disabled={!cnpj}>
                            <MessageSquare className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <h4 className="font-medium leading-none">Adicionar Comentário</h4>
                                <p className="text-sm text-muted-foreground">Adicione uma anotação para a chave {item.key.slice(0, 10)}...</p>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="comment">Comentário</Label>
                                <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
                            </div>
                            <Button onClick={handleSaveComment} disabled={isSaving}>
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                                Salvar
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </TableCell>
        </TableRow>
    );
};

interface KeyTableProps {
    title: string;
    description: string;
    keys: KeyInfo[];
    cnpj: string | null;
    filename: string;
}

const KeyTable = ({ title, description, keys, cnpj, filename }: KeyTableProps) => {
    const { toast } = useToast();
    
    const handleDownload = () => {
        if (keys.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Nenhum dado para baixar',
                description: `Não há chaves na lista para o arquivo ${filename}.`
            });
            return;
        }
        const data = keys.map(item => ({ 
            "Chave de acesso": normalizeKey(item.key),
            "Tipo": item.docType,
            "Direção": item.direction,
            "Fornecedor/Cliente": item.partnerName,
            "Data de Emissão": item.emissionDate,
            "Valor": item.value
        }));
        const worksheet = XLSX.utils.json_to_sheet(data);
        worksheet['!cols'] = [{ wch: 50 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 15 }, { wch: 15 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Chaves");
        XLSX.writeFile(workbook, filename);
        toast({ title: "Download Iniciado", description: `O arquivo ${filename} está sendo baixado.` });
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle className="font-headline text-xl">{title}</CardTitle>
                        <CardDescription>{description}</CardDescription>
                    </div>
                    <Button onClick={handleDownload} disabled={keys.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Baixar
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[450px] overflow-y-auto pr-3">
                {keys.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Chave</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Direção</TableHead>
                                <TableHead>Fornecedor/Cliente</TableHead>
                                <TableHead>Data Emissão</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                                <TableHead className="text-center">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {keys.map(item => <KeyItemRow key={item.key} item={item} cnpj={cnpj} />)}
                        </TableBody>
                    </Table>
                ) : (
                    <p className="text-muted-foreground italic p-4 text-center">Nenhuma divergência encontrada nesta categoria.</p>
                )}
            </CardContent>
        </Card>
    );
};


interface KeyResultsDisplayProps {
    results: KeyCheckResult;
    cnpj: string | null;
}

export function KeyResultsDisplay({ results, cnpj }: KeyResultsDisplayProps) {
    return (
        <div className="space-y-8">
            <KeyTable
                title="Chaves Válidas não encontradas no SPED"
                description="Estas chaves estavam em seus arquivos mas não no SPED TXT."
                keys={results.keysNotFoundInTxt || []}
                cnpj={cnpj}
                filename="chaves_nao_encontradas_no_sped.xlsx"
            />
            <KeyTable
                title="Chaves do SPED não encontradas em Chaves Válidas"
                description="Estas chaves estavam no seu arquivo SPED TXT mas não nos arquivos primários."
                keys={results.keysInTxtNotInSheet || []}
                cnpj={cnpj}
                filename="chaves_apenas_no_sped.xlsx"
            />
        </div>
    );
}
