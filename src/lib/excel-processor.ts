
import { cfopDescriptions } from './cfop';

type DataFrame = any[];
type DataFrames = { [key: string]: DataFrame };

// Helper to safely convert values to string for key creation
const cleanAndToStr = (value: any): string => {
    if (value === null || typeof value === 'undefined') {
        return "";
    }
    // Convert to string and trim
    let strValue = String(value).trim();
    
    // If it's a number ending in .0, remove the .0
    if (/^\d+\.0$/.test(strValue)) {
        strValue = strValue.substring(0, strValue.length - 2);
    }
    
    return strValue;
};


export function processDataFrames(dfs: DataFrames): DataFrames {
    const processedDfs: DataFrames = JSON.parse(JSON.stringify(dfs));

    // Etapa 1: Criar a coluna "Chave Unica" em todas as planilhas relevantes
    for (const sheetName in processedDfs) {
        const df = processedDfs[sheetName];
        if (df && df.length > 0 && df[0] && "Número" in df[0] && "CPF/CNPJ" in df[0]) {
            processedDfs[sheetName] = df.map(row => {
                if(row && row["Número"] !== undefined && row["CPF/CNPJ"] !== undefined) {
                    const chaveUnica = cleanAndToStr(row["Número"]) + cleanAndToStr(row["CPF/CNPJ"]);
                    return { "Chave Unica": chaveUnica, ...row };
                }
                return row;
            });
        }
    }

    // Etapa 2: Unificar NFE e CTE e remover linhas de totais
    let notasValidasTemporaria = [
        ...(processedDfs["NF-Stock NFE"] || []),
        ...(processedDfs["NF-Stock CTE"] || [])
    ];
    
    const phrasesToRemove = ["TOTAL", "Valor total das notas", "Valor Total da Prestação"];
    notasValidasTemporaria = notasValidasTemporaria.filter(row => {
        if (!row || Object.keys(row).length === 0) return false;
        const isRowEffectivelyEmpty = Object.values(row).every(value => value === null || String(value).trim() === '');
        if (isRowEffectivelyEmpty) return false;
        return !Object.values(row).some(value => 
            typeof value === 'string' && phrasesToRemove.some(phrase => value.toUpperCase().includes(phrase.toUpperCase()))
        );
    });

    // Etapa 3: Identificar e separar as exceções
    const chavesUnicasARemover = new Set<string>();

    // Exceção 1: Notas Canceladas
    processedDfs["Notas Canceladas"] = notasValidasTemporaria.filter(row => row && row["Status"] === "Canceladas");
    processedDfs["Notas Canceladas"].forEach(row => {
        if (row && row["Chave Unica"]) {
            chavesUnicasARemover.add(cleanAndToStr(row["Chave Unica"]));
        }
    });

    // Exceção 2: Emissão Própria (CFOP iniciando com '1' ou '2' nos itens)
    const chavesEmissaoPropria = new Set<string>();
    if (processedDfs["NF-Stock Itens"]) {
        processedDfs["NF-Stock Itens"].forEach(item => {
            if (item && item["CFOP"]) {
                const cfop = cleanAndToStr(item["CFOP"]);
                if (cfop.startsWith('1') || cfop.startsWith('2')) {
                    chavesEmissaoPropria.add(cleanAndToStr(item["Chave Unica"]));
                }
            }
        });
    }

    processedDfs["Emissão Própria"] = notasValidasTemporaria.filter(row => 
        row && row["Chave Unica"] && chavesEmissaoPropria.has(cleanAndToStr(row["Chave Unica"]))
    );
    processedDfs["Emissão Própria"].forEach(row => {
        if(row && row["Chave Unica"]) {
            chavesUnicasARemover.add(cleanAndToStr(row["Chave Unica"]));
        }
    });

    // Exceção 3, 4, 5: Planilhas de exceção carregadas
    const exceptionSheets = [
        "NF-Stock NFE Operação Não Realizada",
        "NF-Stock NFE Operação Desconhecida",
        "NF-Stock CTE Desacordo de Serviço"
    ];
    
    exceptionSheets.forEach(sheetName => {
        if (processedDfs[sheetName]) {
            processedDfs[sheetName].forEach(row => {
                if (row && row["Chave Unica"]) {
                    chavesUnicasARemover.add(cleanAndToStr(row["Chave Unica"]));
                }
            });
        }
    });
    
    // Etapa 4: Criar a lista final de "Notas Válidas"
    processedDfs["Notas Válidas"] = notasValidasTemporaria.filter(row => 
        row && row["Chave Unica"] && !chavesUnicasARemover.has(cleanAndToStr(row["Chave Unica"]))
    );
    
    // Etapa 5: Criar "Itens Válidos" e "Chaves Válidas" a partir das "Notas Válidas" JÁ FILTRADAS
    const chavesFinaisValidas = new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave Unica"])).filter(Boolean));

    if (processedDfs["NF-Stock Itens"]) {
        processedDfs["Itens Válidos"] = processedDfs["NF-Stock Itens"].filter(row => 
            row && row["Chave Unica"] && chavesFinaisValidas.has(cleanAndToStr(row["Chave Unica"]))
        );
    } else {
        processedDfs["Itens Válidos"] = [];
    }

    const chavesAcessoValidas = [...new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave de acesso"])).filter(Boolean))];
    processedDfs["Chaves Válidas"] = chavesAcessoValidas.map(key => ({ "Chave de acesso": key }));
    
    // Etapa 6: Criar "Imobilizados" a partir dos "Itens Válidos" (sem removê-los da origem)
    if (processedDfs["Itens Válidos"].length > 0 && processedDfs["Itens Válidos"][0]?.["Valor Unitário"]) {
        processedDfs["Imobilizados"] = processedDfs["Itens Válidos"].filter(row => {
            if (!row || !row["Valor Unitário"]) return false;
            const valor = parseFloat(String(row["Valor Unitário"]).replace(',', '.'));
            return !isNaN(valor) && valor > 1200.00;
        });
    } else {
        processedDfs["Imobilizados"] = [];
    }

    // Etapa 7: Adicionar descrição do CFOP a todas as abas
    for (const sheetName in processedDfs) {
        const df = processedDfs[sheetName];
        if (!df || df.length === 0) continue;

        const columnsToCheck = ["CFOP", "CFOP_Itens"]; // CFOP_Itens não deve existir mais, mas mantemos por segurança
        if (df[0] && "CFOP" in df[0]) {
             processedDfs[sheetName] = df.map(row => {
                if (!row || !("CFOP" in row)) return row;
                const cfopCode = parseInt(cleanAndToStr(row["CFOP"]), 10);
                const description = cfopDescriptions[cfopCode] || '';
                const newColName = 'Descricao CFOP';
                
                const newRow = { ...row };
                const entries = Object.entries(newRow);
                const colIndex = entries.findIndex(([key]) => key === "CFOP");
                
                if (colIndex > -1 && !Object.prototype.hasOwnProperty.call(row, newColName)) {
                    entries.splice(colIndex + 1, 0, [newColName, description]);
                }

                return Object.fromEntries(entries);
            });
        }
    }

    // Etapa 8: Remover planilhas originais que não serão exibidas
    delete processedDfs["NF-Stock NFE"];
    delete processedDfs["NF-Stock CTE"];
    delete processedDfs["NF-Stock Itens"];

    return processedDfs;
}
