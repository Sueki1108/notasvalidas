
// src/app/history/page.tsx
"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Sheet, History, Search, ArrowLeft, CheckCircle, XCircle, MessageSquare, Group } from "lucide-react";
import Link from 'next/link';
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

type VerificationKey = {
  key: string;
  foundInSped: boolean;
  comment?: string;
};

type Verification = {
  id: string;
  companyName: string;
  cnpj: string;
  competence: string;
  verifiedAt: Timestamp;
  keys: VerificationKey[];
};

export default function HistoryPage() {
    const [verifications, setVerifications] = useState<Verification[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVerification, setSelectedVerification] = useState<Verification | null>(null);

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

    const formatDate = (timestamp: Timestamp) => {
        if (!timestamp) return 'N/A';
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
                         <Button variant="ghost" asChild>
                           <Link href="/key-checker">Verificador de Chaves</Link>
                        </Button>
                         <Button variant="ghost" asChild>
                           <Link href="/merger" className="flex items-center gap-2"><Group />Agrupador</Link>
                        </Button>
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
                                            <TableHead>Data da Verificação</TableHead>
                                            <TableHead>Hora</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {verifications.map((v) => (
                                            <TableRow key={v.id}>
                                                <TableCell className="font-medium">{v.companyName}</TableCell>
                                                <TableCell>{formatCnpj(v.cnpj)}</TableCell>
                                                <TableCell>{v.competence}</TableCell>
                                                <TableCell>{formatDate(v.verifiedAt)}</TableCell>
                                                <TableCell>{formatTime(v.verifiedAt)}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="sm" onClick={() => setSelectedVerification(v)}>
                                                        <Search className="mr-2 h-4 w-4" />
                                                        Ver Detalhes
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
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
                <AlertDialog open={!!selectedVerification} onOpenChange={handleCloseModal}>
                    <AlertDialogContent className="max-w-4xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle>Detalhes da Verificação para {selectedVerification.companyName}</AlertDialogTitle>
                             <AlertDialogDescription>
                                Competência: {selectedVerification.competence} | Verificado em: {formatDate(selectedVerification.verifiedAt)} às {formatTime(selectedVerification.verifiedAt)}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        
                         <div className="space-y-4">
                            <p className="text-sm font-medium">Lista de Chaves Válidas da Planilha</p>
                            <ScrollArea className="h-96 rounded-md border p-4">
                                <ul className="space-y-2">
                                     <TooltipProvider>
                                    {selectedVerification.keys && selectedVerification.keys.map((item, index) => (
                                        <li key={index} className="flex items-center justify-between gap-4 rounded-md bg-secondary/50 p-2 font-mono text-sm">
                                            <div className="flex items-center gap-2">
                                                {item.foundInSped ? (
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <CheckCircle className="h-5 w-5 text-green-600" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Encontrada no SPED</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                ) : (
                                                     <Tooltip>
                                                        <TooltipTrigger>
                                                            <XCircle className="h-5 w-5 text-red-600" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Não encontrada no SPED</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                                <span>{item.key}</span>
                                            </div>
                                            {item.comment && (
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <MessageSquare className="h-5 w-5 text-blue-600" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{item.comment}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            )}
                                        </li>
                                    ))}
                                    </TooltipProvider>
                                </ul>
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
    
