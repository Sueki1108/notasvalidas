// src/app/history/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Sheet, History, Search, ArrowLeft, CheckCircle, XCircle, MessageSquare, Group, FileText, ChevronDown, FolderSync, Replace } from "lucide-react";
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCnpj } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { KeyInfo } from "@/app/actions";


type VerificationKey = KeyInfo & {
  foundInSped: boolean;
};

type VerificationStats = {
    totalSheetKeys: number;
    totalSpedKeys: number;
    foundInBoth: number;
    onlyInSheet: number;
    onlyInSped: number;
};

type Verification = {
  id: string;
  companyName: string;
  cnpj: string;
  competence: string;
  verifiedAt: Timestamp;
  keys: VerificationKey[];
  stats: VerificationStats;
};

export default function HistoryPage() {
    const [verifications, setVerifications] = useState<Verification[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVerification, setSelectedVerification] = useState<Verification | null>(null);

    const groupedKeys = useMemo(() => {
        if (!selectedVerification || !selectedVerification.keys) {
            return { foundInBoth: [], onlyInSheet: [], onlyInSped: [] };
        }
        return {
            foundInBoth: selectedVerification.keys.filter(k => k.origin === 'planilha' && k.foundInSped),
            onlyInSheet: selectedVerification.keys.filter(k => k.origin === 'planilha' && !k.foundInSped),
            onlyInSped: selectedVerification.keys.filter(k => k.origin === 'sped'),
        };
    }, [selectedVerification]);

    useEffect(() => {
        const fetchVerifications = async () => {
            try {
                const q = query(collection(db, "verifications"), orderBy("verifiedAt", "desc"));
                const querySnapshot = await getDocs(q);
                const data = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                })) as Verification[];
                setVerifications(data);
            } catch (error) {
                console.error("Error fetching verifications: ", error);
            } finally {
                setLoading(false);
            }
        };

        fetchVerifications();
    }, []);

    const handleCloseModal = () => {
        setSelectedVerification(null);
    }

    const formatDate = (timestamp: Timestamp | string) => {
        if (!timestamp) return 'N/A';
        if (typeof timestamp === 'string') {
             if (timestamp.includes('T')) return new Date(timestamp).toLocaleDateString('pt-BR');
             if (timestamp.length === 8) { //DDMMYYYY
                return `${timestamp.substring(0,2)}/${timestamp.substring(2,4)}/${timestamp.substring(4,8)}`
             }
             return timestamp;
        }
        return timestamp.toDate().toLocaleDateString('pt-BR');
    }
    
    const formatTime = (timestamp: Timestamp) => {
        if (!timestamp) return '';
        return timestamp.toDate().toLocaleTimeString('pt-BR');
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2">
                            <Sheet className="h-6 w-6 text-primary" />
                            <h1 className="text-xl font-bold font-headline">Excel Workflow Automator</h1>
                        </Link>
                    </div>
                    <nav className="flex items-center gap-4">
                        <Button variant="ghost" asChild>
                            <Link href="/">Processamento Principal</Link>
                        </Button>
                         <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost">Ferramentas <ChevronDown className="ml-2 h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem asChild>
                                    <Link href="/merger" className="flex items-center gap-2 w-full"><Group />Agrupador de Planilhas</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/sage-itens-nf" className="flex items-center gap-2 w-full"><FileText />Sage - Itens da NF</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/unify-folders" className="flex items-center gap-2 w-full"><FolderSync />Unificar Pastas</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/extract-nfe" className="flex items-center gap-2 w-full"><Search />Extrair NF-e</Link>
                                </DropdownMenuItem>
                                 <DropdownMenuItem asChild>
                                    <Link href="/extract-cte" className="flex items-center gap-2 w-full"><Search />Extrair CT-e</Link>
                                </DropdownMenuItem>
                                 <DropdownMenuItem asChild>
                                    <Link href="/returns" className="flex items-center gap-2 w-full"><FileText />Devoluções</Link>
                                </DropdownMenuItem>
                                 <DropdownMenuItem asChild>
                                    <Link href="/alterar-xml" className="flex items-center gap-2 w-full"><Replace />Alterar XML</Link>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                <div className="mx-auto max-w-7xl space-y-8">
                    <Card className="shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <History className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Histórico de Verificações</CardTitle>
                                    <CardDescription>Consulte os registros de todas as verificações de competência realizadas.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="h-8 w-8 animate-spin" />
                                </div>
                            ) : verifications.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Empresa</TableHead>
                                            <TableHead>CNPJ</TableHead>
                                            <TableHead>Competência</TableHead>
                                            <TableHead>Verificação</TableHead>
                                            <TableHead className="text-center">Chaves</TableHead>
                                            <TableHead className="text-center">Divergências</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {verifications.map((v) => {
                                            const totalKeys = v.stats?.totalSheetKeys || 0;
                                            const discrepancies = (v.stats?.onlyInSheet || 0) + (v.stats?.onlyInSped || 0);
                                            return (
                                            <TableRow key={v.id}>
                                                <TableCell className="font-medium">{v.companyName}</TableCell>
                                                <TableCell>{formatCnpj(v.cnpj)}</TableCell>
                                                <TableCell>{v.competence}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span>{formatDate(v.verifiedAt)}</span>
                                                        <span className="text-xs text-muted-foreground">{formatTime(v.verifiedAt)}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">{totalKeys}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={discrepancies > 0 ? "destructive" : "default"} className={discrepancies > 0 ? "" : "bg-green-600"}>
                                                        {discrepancies}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="sm" onClick={() => setSelectedVerification(v)}>
                                                        <Search className="mr-2 h-4 w-4" />
                                                        Ver Detalhes
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )})}
                                    </TableBody>
                                </Table>
                            ) : (
                                 <Alert className="border-primary/50">
                                    <History className="h-4 w-4" />
                                    <AlertTitle>Nenhum histórico encontrado</AlertTitle>
                                    <AlertDescription>
                                        Ainda não há registros de verificação. Processe um arquivo SPED para começar.
                                        <Button asChild className="mt-4">
                                            <Link href="/">
                                                <ArrowLeft className="mr-2 h-4 w-4" />
                                                Voltar para o Processamento
                                            </Link>
                                        </Button>
                                    </AlertDescription>
                                </Alert>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>

            {selectedVerification && (
                <AlertDialog open={!!selectedVerification} onOpenChange={(isOpen) => !isOpen && handleCloseModal()}>
                    <AlertDialogContent className="max-w-6xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle>Detalhes da Verificação: {selectedVerification.companyName}</AlertDialogTitle>
                             <AlertDialogDescription>
                                Competência: {selectedVerification.competence} | Verificado em: {formatDate(selectedVerification.verifiedAt)} às {formatTime(selectedVerification.verifiedAt)}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        
                         <div className="space-y-4">
                            <ScrollArea className="h-96 w-full pr-4">
                               <TooltipProvider>
                                <Accordion type="single" collapsible defaultValue="item-1" className="w-full">
                                    <AccordionItem value="item-1">
                                        <AccordionTrigger className="font-semibold">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle className="text-green-600" />
                                                Encontradas em Ambos ({groupedKeys.foundInBoth.length})
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {groupedKeys.foundInBoth.length > 0 ? (
                                                <ul className="space-y-2 pt-2">
                                                    {groupedKeys.foundInBoth.map((item, index) => (
                                                        <li key={index} className="flex items-center justify-between gap-4 rounded-md bg-secondary/50 p-2 font-mono text-sm">
                                                            <span>{item.key}</span>
                                                            {item.comment && (
                                                                <Tooltip>
                                                                    <TooltipTrigger><MessageSquare className="h-5 w-5 text-blue-600" /></TooltipTrigger>
                                                                    <TooltipContent><p>{item.comment}</p></TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : <p className="pt-2 text-sm text-muted-foreground">Nenhuma chave encontrada em ambas as fontes.</p>}
                                        </AccordionContent>
                                    </AccordionItem>
                                     <AccordionItem value="item-2">
                                        <AccordionTrigger className="font-semibold">
                                            <div className="flex items-center gap-2">
                                                <XCircle className="text-red-600" />
                                                Apenas na Planilha ({groupedKeys.onlyInSheet.length})
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {groupedKeys.onlyInSheet.length > 0 ? (
                                                <ul className="space-y-2 pt-2">
                                                    {groupedKeys.onlyInSheet.map((item, index) => (
                                                        <li key={index} className="flex items-center justify-between gap-4 rounded-md bg-secondary/50 p-2 font-mono text-sm">
                                                            <span>{item.key}</span>
                                                            {item.comment && (
                                                                <Tooltip>
                                                                    <TooltipTrigger><MessageSquare className="h-5 w-5 text-blue-600" /></TooltipTrigger>
                                                                    <TooltipContent><p>{item.comment}</p></TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : <p className="pt-2 text-sm text-muted-foreground">Nenhuma chave encontrada apenas na planilha.</p>}
                                        </AccordionContent>
                                    </AccordionItem>
                                     <AccordionItem value="item-3">
                                        <AccordionTrigger className="font-semibold">
                                             <div className="flex items-center gap-2">
                                                <FileText className="text-blue-600" />
                                                Apenas no SPED ({groupedKeys.onlyInSped.length})
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {groupedKeys.onlyInSped.length > 0 ? (
                                                 <ul className="space-y-2 pt-2">
                                                    {groupedKeys.onlyInSped.map((item, index) => (
                                                         <li key={index} className="flex items-center justify-between gap-4 rounded-md bg-secondary/50 p-2 font-mono text-sm">
                                                            <span>{item.key}</span>
                                                            {item.comment && (
                                                                <Tooltip>
                                                                    <TooltipTrigger><MessageSquare className="h-5 w-5 text-blue-600" /></TooltipTrigger>
                                                                    <TooltipContent><p>{item.comment}</p></TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : <p className="pt-2 text-sm text-muted-foreground">Nenhuma chave encontrada apenas no SPED.</p>}
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                                </TooltipProvider>
                            </ScrollArea>
                        </div>
                        
                        <AlertDialogFooter>
                            <AlertDialogAction onClick={handleCloseModal}>Fechar</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}

            <footer className="mt-12 border-t py-6">
                <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
                    <p>Powered by Firebase Studio. Interface intuitiva para automação de fluxos de trabalho.</p>
                </div>
            </footer>
        </div>
    );
}

    