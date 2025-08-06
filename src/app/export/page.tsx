// src/app/export/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getProjectFilesAsText } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, Copy, Sheet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


export default function ExportPage() {
    const [allFilesContent, setAllFilesContent] = useState("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleGenerateExport = async () => {
        setLoading(true);
        setAllFilesContent("");
        try {
            const content = await getProjectFilesAsText();
            setAllFilesContent(content);
            toast({
                title: "Conteúdo Gerado",
                description: "Todo o código do projeto foi unido no campo abaixo.",
            });
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Erro ao gerar arquivo",
                description: "Não foi possível ler os arquivos do projeto.",
            });
            console.error(error);
        } finally {
            setLoading(false);
        }
    };
    
    const handleCopyToClipboard = () => {
        if (!allFilesContent) {
             toast({
                variant: "destructive",
                title: "Nenhum conteúdo para copiar",
                description: "Gere o texto primeiro.",
            });
            return;
        }
        navigator.clipboard.writeText(allFilesContent).then(() => {
            toast({ title: "Copiado!", description: "O conteúdo foi copiado para a área de transferência." });
        }).catch(() => {
            toast({ variant: 'destructive', title: "Falha ao copiar." });
        });
    };

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
                           <a href="/key-checker">Verificador de Chaves</a>
                        </Button>
                        <Button variant="ghost" disabled>
                           <a href="/export">Exportar Código</a>
                        </Button>
                    </nav>
                </div>
            </header>
             <main className="container mx-auto p-4 md:p-8">
                 <div className="mx-auto max-w-5xl space-y-8">
                    <Card className="shadow-lg">
                         <CardHeader>
                            <div className="flex items-center gap-3">
                                <FileText className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Exportar Código Completo</CardTitle>
                                    <CardDescription>Junte todo o código do projeto em um único campo de texto para fácil cópia e compartilhamento.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-4">
                                <Button onClick={handleGenerateExport} disabled={loading} className="flex-1">
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Gerando...
                                        </>
                                    ) : "Gerar Texto para Exportação"
                                    }
                                </Button>
                                <Button onClick={handleCopyToClipboard} variant="outline" disabled={!allFilesContent}>
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copiar Tudo
                                </Button>
                            </div>
                            <Textarea
                                readOnly
                                value={allFilesContent}
                                placeholder="O conteúdo de todos os arquivos do projeto aparecerá aqui..."
                                className="min-h-[60vh] font-mono text-xs bg-muted/50"
                            />
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
