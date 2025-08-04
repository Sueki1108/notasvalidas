
import { cfopDescriptions } from './cfop';

type DataFrame = any[];
type DataFrames = { [key: string]: DataFrame };

// Helper to safely convert values to string for key creation
const cleanAndToStr = (value: any): string => {
    if (value === null || typeof value === 'undefined') {
        return "";
    }
    const strValue = String(value);
    // Check if it's a number ending in .0
    if (/^\d+\.0$/.test(strValue)) {
        return strValue.slice(0, -2);
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

    // Etapa 2: Buscar CFOP da planilha NF-Stock Itens e adicionar às planilhas de notas
    if (processedDfs["NF-Stock Itens"]) {
        const dfItens = processedDfs["NF-Stock Itens"];
        if (dfItens.length > 0 && dfItens[0] && "Chave Unica" in dfItens[0] && "CFOP" in dfItens[0]) {
            const cfopLookup = new Map<string, any>();
            dfItens.forEach(row => {
                if(row && row["Chave Unica"]) {
                    cfopLookup.set(row["Chave Unica"], row["CFOP"]);
                }
            });

            const targetSheets = [
                "NF-Stock NFE",
                "NF-Stock NFE Operação Não Realizada",
                "NF-Stock NFE Operação Desconhecida",
                "NF-Stock CTE Desacordo de Serviço"
            ];

            targetSheets.forEach(sheetName => {
                if (processedDfs[sheetName] && processedDfs[sheetName].length > 0 && processedDfs[sheetName][0] && "Chave Unica" in processedDfs[sheetName][0]) {
                    processedDfs[sheetName] = processedDfs[sheetName].map(row => ({
                        ...row,
                        "CFOP_Itens": cfopLookup.get(row["Chave Unica"])
                    }));
                }
            });
        }
    }
    
    // Etapa 3: Separar todas as notas em válidas e canceladas para começar
    let dfNfeValidas: DataFrame = [];
    if (processedDfs["NF-Stock NFE"]?.length > 0 && processedDfs["NF-Stock NFE"][0] && "Status" in processedDfs["NF-Stock NFE"][0]) {
        dfNfeValidas = processedDfs["NF-Stock NFE"].filter(row => row && row["Status"] !== "Canceladas");
        processedDfs["Notas Canceladas"] = processedDfs["NF-Stock NFE"].filter(row => row && row["Status"] === "Canceladas");
    } else {
        processedDfs["Notas Canceladas"] = [];
    }

    let dfCteValidas: DataFrame = [];
    if (processedDfs["NF-Stock CTE"]?.length > 0 && processedDfs["NF-Stock CTE"][0] && "Status" in processedDfs["NF-Stock CTE"][0]) {
        dfCteValidas = processedDfs["NF-Stock CTE"].filter(row => row && row["Status"] !== "Canceladas");
         processedDfs["Notas Canceladas"].push(...processedDfs["NF-Stock CTE"].filter(row => row && row["Status"] === "Canceladas"));
    }

    let notasValidasTemporaria = [...dfNfeValidas, ...dfCteValidas];

    // Limpar linhas de resumo e vazias
    const phrasesToRemove = ["TOTAL", "Valor total das notas", "Valor Total da Prestação"];
    notasValidasTemporaria = notasValidasTemporaria.filter(row => {
        if (!row || Object.keys(row).length === 0) return false;
        const isRowEffectivelyEmpty = Object.values(row).every(value => value === null || String(value).trim() === '');
        if (isRowEffectivelyEmpty) return false;
        return !Object.values(row).some(value => 
            typeof value === 'string' && phrasesToRemove.some(phrase => value.toUpperCase().includes(phrase))
        );
    });

    // Etapa 4: Coletar TODAS as chaves que devem ser removidas da lista de notas válidas
    const chavesUnicasARemover = new Set<string>();

    // Coletar chaves de abas de exceção
    const sourceSheetsForRemoval = [
        "NF-Stock NFE Operação Não Realizada",
        "NF-Stock NFE Operação Desconhecida",
        "NF-Stock CTE Desacordo de Serviço"
    ];
    
    sourceSheetsForRemoval.forEach(sheetName => {
        if (processedDfs[sheetName]?.length > 0 && processedDfs[sheetName][0]?.["Chave Unica"]) {
            processedDfs[sheetName].forEach(row => {
                if (row && row["Chave Unica"]) {
                    chavesUnicasARemover.add(cleanAndToStr(row["Chave Unica"]));
                }
            });
        }
    });

    // Identificar "Emissão Própria" e coletar suas chaves para remoção
    if (notasValidasTemporaria.length > 0 && notasValidasTemporaria[0]?.["CFOP_Itens"]) {
        const emissaoPropriaMask = (row: any) => {
            if (!row || !row["CFOP_Itens"]) return false;
            const cfop = cleanAndToStr(row["CFOP_Itens"]);
            return cfop.startsWith('1') || cfop.startsWith('2');
        };
        
        processedDfs["Emissão Própria"] = notasValidasTemporaria.filter(emissaoPropriaMask);
        
        processedDfs["Emissão Própria"].forEach(row => {
            if(row && row["Chave Unica"]) {
                chavesUnicasARemover.add(cleanAndToStr(row["Chave Unica"]));
            }
        });
    }

    // Etapa 5: Filtrar a lista de notas válidas para criar a versão final
    processedDfs["Notas Válidas"] = notasValidasTemporaria.filter(row => 
        row && !chavesUnicasARemover.has(cleanAndToStr(row["Chave Unica"]))
    );
    
    // Etapa 6: Criar "Itens Válidos" e "Chaves Válidas" a partir das "Notas Válidas" JÁ FILTRADAS
    const chavesFinaisValidas = new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave Unica"])).filter(Boolean));

    if (processedDfs["NF-Stock Itens"]?.length > 0 && processedDfs["NF-Stock Itens"][0]?.["Chave Unica"]) {
        processedDfs["Itens Válidos"] = processedDfs["NF-Stock Itens"].filter(row => 
            row && chavesFinaisValidas.has(cleanAndToStr(row["Chave Unica"]))
        );
    }

    if (processedDfs["Notas Válidas"].length > 0 && processedDfs["Notas Válidas"][0]?.["Chave de acesso"]) {
        const chavesAcessoValidas = [...new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave de acesso"])).filter(Boolean))];
        processedDfs["Chaves Válidas"] = chavesAcessoValidas.map(key => ({ "Chave de acesso": key }));
    } else {
        processedDfs["Chaves Válidas"] = [];
    }
    
    // Etapa 7: Criar "Imobilizados" a partir dos "Itens Válidos"
    if (processedDfs["Itens Válidos"]?.length > 0 && processedDfs["Itens Válidos"][0]?.["Valor Unitário"]) {
        const imobilizadosMask = (row: any) => {
            if (!row || !row["Valor Unitário"]) return false;
            const valor = parseFloat(String(row["Valor Unitário"]).replace(',', '.'));
            return !isNaN(valor) && valor > 1200.00;
        };
        processedDfs["Imobilizados"] = processedDfs["Itens Válidos"].filter(imobilizadosMask);
        processedDfs["Itens Válidos"] = processedDfs["Itens Válidos"].filter(row => !imobilizadosMask(row));
    }
    
    // Etapa 8: Adicionar descrição do CFOP a todas as abas
    for (const sheetName in processedDfs) {
        const df = processedDfs[sheetName];
        if (!df || df.length === 0) continue;

        const columnsToCheck = ["CFOP", "CFOP_Itens"];
        columnsToCheck.forEach(colName => {
            if (df[0] && colName in df[0]) {
                processedDfs[sheetName] = df.map(row => {
                    if (!row) return row;
                    const cfopCode = parseInt(cleanAndToStr(row[colName]), 10);
                    const description = cfopDescriptions[cfopCode] || '';
                    const newColName = `Descricao ${colName}`;
                    
                    const newRow = { ...row };
                    const entries = Object.entries(newRow);
                    const index = entries.findIndex(([key]) => key === colName);
                    
                    if (index > -1 && !Object.keys(row).includes(newColName)) { // Evita adicionar a coluna de descrição múltiplas vezes
                        entries.splice(index + 1, 0, [newColName, description]);
                    }

                    return Object.fromEntries(entries);
                });
            }
        });
    }

    // Etapa 9: Remover planilhas originais que não serão exibidas
    delete processedDfs["NF-Stock NFE"];
    delete processedDfs["NF-Stock CTE"];
    delete processedDfs["NF-Stock Itens"];

    return processedDfs;
}
