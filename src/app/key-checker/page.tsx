// src/app/key-checker/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KeyRound, FileText, Loader2, Sheet } from "lucide-react";
import { KeyResultsDisplay } from "@/components/app/key-results-display";
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export type KeyCheckResult = {
    keysNotFoundInTxt: string[];
    keysInTxtNotInSheet: string[];
    duplicateKeysInSheet: string[];
    duplicateKeysInTxt: string[];
};

export default function KeyCheckerPage() {
    const [results, setResults] = useState<KeyCheckResult | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        try {
            const storedResults = sessionStorage.getItem('keyCheckResults');
            if (storedResults && storedResults !== 'null') {
                const parsedResults = JSON.parse(storedResults);
                setResults(parsedResults);
            } else {
                 toast({
                    variant: "destructive",
                    title: "Nenhum resultado encontrado",
                    description: "Por favor, processe os arquivos na página inicial primeiro.",
                });
                // Redirect back to home if no data is found
                router.push('/');
            }
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Erro ao carregar resultados",
                description: "Os dados de resultado podem estar corrompidos. Tente processar novamente.",
            });
            router.push('/');
        } finally {
            setLoading(false);
        }
    }, [toast, router]);

    return (
        <div className="min-h-screen bg-background text-foreground">
             <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <a href="/" className="flex items-center gap-2">
                             <Sheet className="h-6 w-6 text-primary" />
                             <h1 className="text-xl font-bold font-headline">Excel Workflow Automator</h1>
                        </a>
                    </div>
                     <nav className="flex items-center gap-4">
                        <Button variant="ghost" asChild>
                           <a href="/">Processamento Principal</a>
                        </Button>
                         <Button variant="ghost" asChild>
                           <Link href="/export">Exportar Projeto</Link>
                        </Button>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                 <div className="mx-auto max-w-5xl space-y-8">
                    <Card className="shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <KeyRound className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Resultados da Verificação de Chaves</CardTitle>
                                    <CardDescription>Comparação entre as "Chaves Válidas" processadas e o arquivo de texto fornecido.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                             {loading ? (
                                <div className="flex items-center justify-center p-8">
                                    <Loader2 className="mr-2 h-8 w-8 animate-spin" />
                                    <p>Carregando resultados...</p>
                                </div>
                            ) : results ? (
                                <KeyResultsDisplay results={results} />
                            ) : (
                                <Alert>
                                    <FileText className="h-4 w-4" />
                                    <AlertTitle>Nenhum resultado para exibir</AlertTitle>
                                    <AlertDescription>
                                       Não foram encontrados resultados da verificação de chaves. Volte para a página inicial e processe os arquivos.
                                    </AlertDescription>
                                </Alert>
                            )}
                        </CardContent>
                    </Card>
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
