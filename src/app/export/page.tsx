// src/app/export/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sheet, FileDown, Copy } from "lucide-react";
import { getProjectFilesAsText } from "@/app/actions";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";


export default function ExportPage() {
    const [loading, setLoading] = useState(false);
    const [projectText, setProjectText] = useState("");
    const { toast } = useToast();

    const handleGenerateText = async () => {
        setLoading(true);
        setProjectText("");
        try {
            const text = await getProjectFilesAsText();
            setProjectText(text);
            toast({
                title: "Código do Projeto Gerado",
                description: "O texto completo do projeto está pronto para ser copiado.",
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Erro ao Gerar Texto",
                description: error.message || "Não foi possível buscar os arquivos do projeto.",
            });
        } finally {
            setLoading(false);
        }
    };
    
    const handleCopyToClipboard = () => {
        if (!projectText) {
            toast({
                variant: 'destructive',
                title: 'Nenhum texto para copiar',
                description: 'Gere o texto do projeto primeiro.'
            });
            return;
        }
        navigator.clipboard.writeText(projectText).then(() => {
            toast({
                title: 'Copiado para a Área de Transferência',
                description: 'O código do projeto foi copiado com sucesso.',
            });
        }).catch(err => {
            toast({
                variant: 'destructive',
                title: 'Falha ao Copiar',
                description: 'Não foi possível copiar o texto. Verifique as permissões do seu navegador.'
            });
        });
    }


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
                           <Link href="/">Processamento Principal</Link>
                        </Button>
                        <Button variant="ghost" asChild>
                           <Link href="/key-checker">Verificador de Chaves</Link>
                        </Button>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                 <div className="mx-auto max-w-5xl space-y-8">
                    <Card className="shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <FileDown className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Exportar Código do Projeto</CardTitle>
                                    <CardDescription>Gere um único arquivo de texto com todo o código-fonte para transferir este projeto.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button onClick={handleGenerateText} disabled={loading} className="w-full">
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Gerando...
                                    </>
                                ) : "Gerar Texto para Exportação"}
                            </Button>
                            
                            {projectText && (
                                <div className="space-y-2">
                                     <Textarea
                                        readOnly
                                        value={projectText}
                                        className="h-96 w-full font-code text-xs"
                                        placeholder="O código do projeto aparecerá aqui..."
                                    />
                                    <Button onClick={handleCopyToClipboard} className="w-full">
                                        <Copy className="mr-2 h-4 w-4" />
                                        Copiar Tudo
                                    </Button>
                                </div>
                            )}

                             {loading && (
                                <div className="flex flex-col items-center justify-center p-8 text-center">
                                    <Loader2 className="mr-2 h-8 w-8 animate-spin" />
                                    <p className="mt-2 text-muted-foreground">Lendo todos os arquivos do projeto... Isso pode levar um momento.</p>
                                </div>
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
