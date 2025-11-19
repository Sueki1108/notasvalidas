// src/app/solver/page.tsx
"use client";

import * as React from "react";
import { Wand2, Calculator, Check, X, Loader2, Trash2, ChevronDown, Group, FileText, FolderSync, Search, Replace, Layers, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { findSumCombinations } from "@/app/actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import Link from 'next/link';
import { Sheet } from "lucide-react";


export default function SolverPage() {
    const [values, setValues] = React.useState<string>("");
    const [target, setTarget] = React.useState<string>("");
    const [processing, setProcessing] = React.useState(false);
    const [result, setResult] = React.useState<{ value: number; inCombination: boolean }[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const { toast } = useToast();

    const handleClear = () => {
        setValues("");
        setTarget("");
        setResult(null);
        setError(null);
    };

    const handleSubmit = async () => {
        const numbers = values.split('\n').map(v => parseFloat(v.trim().replace(',', '.'))).filter(v => !isNaN(v));
        const targetValue = parseFloat(target.replace(',', '.'));

        if (numbers.length === 0) {
            toast({ variant: 'destructive', title: "Erro", description: "Por favor, insira uma lista de valores." });
            return;
        }
        if (isNaN(targetValue)) {
            toast({ variant: 'destructive', title: "Erro", description: "Por favor, insira um valor alvo válido." });
            return;
        }

        setProcessing(true);
        setError(null);
        setResult(null);

        try {
            const response = await findSumCombinations(numbers, targetValue);
            
            if (response.error) {
                setError(response.error);
                toast({ variant: 'destructive', title: 'Não Encontrado', description: response.error });
            } else if (response.combination) {
                const combinationSet = new Set(response.combination);
                const originalNumbersWithStatus = numbers.map(num => {
                    if (combinationSet.has(num)) {
                        combinationSet.delete(num); // Handle duplicates
                        return { value: num, inCombination: true };
                    }
                    return { value: num, inCombination: false };
                });
                setResult(originalNumbersWithStatus);
                toast({ title: 'Combinação Encontrada!' });
            }
        } catch (err: any) {
            const errorMessage = err.message || "Ocorreu um erro desconhecido.";
            setError(errorMessage);
            toast({ variant: 'destructive', title: 'Erro no Processamento', description: errorMessage });
        } finally {
            setProcessing(false);
        }
    };

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
                        <Button variant="ghost" asChild><Link href="/">Processamento Principal</Link></Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost">Ferramentas <ChevronDown className="ml-2 h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem asChild><Link href="/merger" className="flex items-center gap-2 w-full"><Group />Agrupador de Planilhas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/juntar-abas" className="flex items-center gap-2 w-full"><Layers />Juntar Abas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/solver" className="flex items-center gap-2 w-full"><Wand2 />Solver</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/unify-folders" className="flex items-center gap-2 w-full"><FolderSync />Unificar Pastas</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/extract-nfe" className="flex items-center gap-2 w-full"><Search />Extrair Itens (NF-e)</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/extract-cte" className="flex items-center gap-2 w-full"><Search />Extrair CT-e</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/returns" className="flex items-center gap-2 w-full"><FileText />Devoluções</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/alterar-xml" className="flex items-center gap-2 w-full"><Replace />Alterar XML</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/separar-xml" className="flex items-center gap-2 w-full"><FileText />Separar XML</Link></DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href="/compare-xml-sage" className="flex items-center gap-2 w-full"><GitCompare />Comparação XML x Sage</Link></DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="ghost" asChild><Link href="/history">Histórico</Link></Button>
                    </nav>
                </div>
            </header>
            <main className="container mx-auto p-4 md:p-8">
                <div className="mx-auto max-w-4xl space-y-8">
                    <Card className="shadow-lg">
                         <CardHeader>
                            <div className="flex items-center gap-3">
                                <Wand2 className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Solver de Combinações</CardTitle>
                                    <CardDescription>Encontre combinações de números que somam um valor alvo.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <h3 className="text-lg font-semibold">1. Cole sua lista de valores</h3>
                                    <Textarea
                                        placeholder="Cole os valores aqui, um por linha..."
                                        className="h-60"
                                        value={values}
                                        onChange={(e) => setValues(e.target.value)}
                                        disabled={processing}
                                    />
                                </div>
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-semibold">2. Defina o Valor Alvo</h3>
                                        <Input
                                            placeholder="Ex: 1540,23"
                                            value={target}
                                            onChange={(e) => setTarget(e.target.value)}
                                            disabled={processing}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Button onClick={handleSubmit} disabled={processing}>
                                            {processing ? <><Loader2 className="animate-spin mr-2" />Buscando...</> : <><Calculator className="mr-2"/>Encontrar Combinação Exata</>}
                                        </Button>
                                        <Button onClick={handleClear} variant="destructive" disabled={processing}>
                                            <Trash2 className="mr-2"/>Limpar Tudo
                                        </Button>
                                    </div>
                                </div>
                            </div>
                             {error && (
                                <Alert variant="destructive">
                                    <Calculator className="h-4 w-4" />
                                    <AlertTitle>Erro</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                        </CardContent>
                    </Card>

                    {result && (
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle>Resultado da Combinação</CardTitle>
                                <CardDescription>Os valores abaixo somam o valor alvo. Você pode copiar e colar esta tabela de volta na sua planilha.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-96 overflow-y-auto rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Valor</TableHead>
                                                <TableHead>Na Combinação?</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {result.map((item, index) => (
                                                <TableRow key={index} data-state={item.inCombination ? "selected" : ""}>
                                                    <TableCell>{item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                          {item.inCombination ? <Check className="text-green-500"/> : <X className="text-destructive"/>}
                                                          {item.inCombination ? 'Sim' : 'Não'}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>
            <footer className="mt-12 border-t py-6">
                <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
                    <p>Powered by Firebase Studio. Interface intuitiva para automação de fluxos de trabalho.</p>
                </div>
            </footer>
        </div>
    );
}
