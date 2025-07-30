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

    // Etapa 1: Criar a coluna "Chave Unica"
    for (const sheetName in processedDfs) {
        const df = processedDfs[sheetName];
        if (df.length > 0 && "Número" in df[0] && "CPF/CNPJ" in df[0]) {
            processedDfs[sheetName] = df.map(row => {
                const chaveUnica = cleanAndToStr(row["Número"]) + cleanAndToStr(row["CPF/CNPJ"]);
                return { "Chave Unica": chaveUnica, ...row };
            });
        }
    }

    // Etapa 2: Buscar CFOP da planilha NF-Stock Itens
    if (processedDfs["NF-Stock Itens"]) {
        const dfItens = processedDfs["NF-Stock Itens"];
        if (dfItens.length > 0 && "Chave Unica" in dfItens[0] && "CFOP" in dfItens[0]) {
            const cfopLookup = new Map<string, any>();
            dfItens.forEach(row => {
                cfopLookup.set(row["Chave Unica"], row["CFOP"]);
            });

            const targetSheets = [
                "NF-Stock NFE",
                "NF-Stock NFE Operação Não Realizada",
                "NF-Stock NFE Operação Desconhecida",
                "NF-Stock CTE Desacordo de Serviço"
            ];

            targetSheets.forEach(sheetName => {
                if (processedDfs[sheetName] && processedDfs[sheetName].length > 0 && "Chave Unica" in processedDfs[sheetName][0]) {
                    processedDfs[sheetName] = processedDfs[sheetName].map(row => ({
                        ...row,
                        "CFOP_Itens": cfopLookup.get(row["Chave Unica"])
                    }));
                }
            });
        }
    }
    
    // Etapa 3: Criar abas "Notas Válidas" e "Notas Canceladas"
    let dfNfeValidas: DataFrame = [];
    let dfNfeCanceladas: DataFrame = [];
    if (processedDfs["NF-Stock NFE"]?.length > 0 && "Status" in processedDfs["NF-Stock NFE"][0]) {
        dfNfeValidas = processedDfs["NF-Stock NFE"].filter(row => row["Status"] !== "Canceladas");
        dfNfeCanceladas = processedDfs["NF-Stock NFE"].filter(row => row["Status"] === "Canceladas");
    }

    let dfCteValidas: DataFrame = [];
    let dfCteCanceladas: DataFrame = [];
    if (processedDfs["NF-Stock CTE"]?.length > 0 && "Status" in processedDfs["NF-Stock CTE"][0]) {
        dfCteValidas = processedDfs["NF-Stock CTE"].filter(row => row["Status"] !== "Canceladas");
        dfCteCanceladas = processedDfs["NF-Stock CTE"].filter(row => row["Status"] === "Canceladas");
    }

    processedDfs["Notas Válidas"] = [...dfNfeValidas, ...dfCteValidas];
    processedDfs["Notas Canceladas"] = [...dfNfeCanceladas, ...dfCteCanceladas];

    // Remover linhas de resumo de "Notas Válidas"
    const phrasesToRemove = ["Valor total das notas", "Valor Total da Prestação"];
    if (processedDfs["Notas Válidas"]) {
        processedDfs["Notas Válidas"] = processedDfs["Notas Válidas"].filter(row => {
            return !Object.values(row).some(value => 
                typeof value === 'string' && phrasesToRemove.some(phrase => value.includes(phrase))
            );
        });
    }

    // Coletar Chaves Únicas das abas de operação para remoção
    const sourceSheetsForRemoval = [
        "NF-Stock NFE Operação Não Realizada",
        "NF-Stock NFE Operação Desconhecida",
        "NF-Stock CTE Desacordo de Serviço"
    ];
    
    const chavesUnicasARemover = new Set<string>();
    sourceSheetsForRemoval.forEach(sheetName => {
        if (processedDfs[sheetName]?.length > 0 && "Chave Unica" in processedDfs[sheetName][0]) {
            processedDfs[sheetName].forEach(row => {
                chavesUnicasARemover.add(cleanAndToStr(row["Chave Unica"]));
            });
        }
    });

    // Aplicar remoção a "Notas Válidas" com base nas chaves de operação
    if (chavesUnicasARemover.size > 0 && processedDfs["Notas Válidas"]?.length > 0 && "Chave Unica" in processedDfs["Notas Válidas"][0]) {
        processedDfs["Notas Válidas"] = processedDfs["Notas Válidas"].filter(row => !chavesUnicasARemover.has(cleanAndToStr(row["Chave Unica"])));
    }
    
    // Criar a aba "Emissão Própria"
    if (processedDfs["Notas Válidas"]?.length > 0 && "CFOP_Itens" in processedDfs["Notas Válidas"][0]) {
        const emissaoPropriaMask = (row: any) => {
            const cfop = cleanAndToStr(row["CFOP_Itens"]);
            return cfop.startsWith('1') || cfop.startsWith('2');
        };
        processedDfs["Emissão Própria"] = processedDfs["Notas Válidas"].filter(emissaoPropriaMask);
        processedDfs["Notas Válidas"] = processedDfs["Notas Válidas"].filter(row => !emissaoPropriaMask(row));
    }

    // Criar a aba "Itens Válidos"
    if (processedDfs["NF-Stock Itens"] && processedDfs["Notas Válidas"]?.length > 0 && "Chave Unica" in processedDfs["Notas Válidas"][0]) {
        const chavesValidas = new Set(processedDfs["Notas Válidas"].map(row => cleanAndToStr(row["Chave Unica"])));
        if (processedDfs["NF-Stock Itens"].length > 0 && "Chave Unica" in processedDfs["NF-Stock Itens"][0]) {
            processedDfs["Itens Válidos"] = processedDfs["NF-Stock Itens"].filter(row => chavesValidas.has(cleanAndToStr(row["Chave Unica"])));
        }
    }

    // Aplicar remoção a "Itens Válidos"
    if (chavesUnicasARemover.size > 0 && processedDfs["Itens Válidos"]?.length > 0 && "Chave Unica" in processedDfs["Itens Válidos"][0]) {
        processedDfs["Itens Válidos"] = processedDfs["Itens Válidos"].filter(row => !chavesUnicasARemover.has(cleanAndToStr(row["Chave Unica"])));
    }
    
    // Criar a aba "Imobilizados"
    if (processedDfs["Itens Válidos"]?.length > 0 && "Valor Unitário" in processedDfs["Itens Válidos"][0]) {
        const imobilizadosMask = (row: any) => {
            const valor = parseFloat(String(row["Valor Unitário"]).replace(',', '.'));
            return !isNaN(valor) && valor > 1200.00;
        };
        processedDfs["Imobilizados"] = processedDfs["Itens Válidos"].filter(imobilizadosMask);
        processedDfs["Itens Válidos"] = processedDfs["Itens Válidos"].filter(row => !imobilizadosMask(row));
    }
    
    // Criar aba "Chaves Válidas"
    if (processedDfs["Notas Válidas"]?.length > 0 && "Chave de acesso" in processedDfs["Notas Válidas"][0]) {
        const uniqueAccessKeys = [...new Set(processedDfs["Notas Válidas"].map(row => cleanAndToStr(row["Chave de acesso"])).filter(Boolean))];
        processedDfs["Chaves Válidas"] = uniqueAccessKeys.map(key => ({ "Chave de acesso": key }));
    }

    // Adicionar descrição do CFOP
    for (const sheetName in processedDfs) {
        const df = processedDfs[sheetName];
        if (!df || df.length === 0) continue;

        const columnsToCheck = ["CFOP", "CFOP_Itens"];
        columnsToCheck.forEach(colName => {
            if (colName in df[0]) {
                processedDfs[sheetName] = df.map(row => {
                    const cfopCode = parseInt(cleanAndToStr(row[colName]), 10);
                    const description = cfopDescriptions[cfopCode] || '';
                    const newColName = `Descricao ${colName}`;
                    
                    const newRow = { ...row };
                    const entries = Object.entries(newRow);
                    const index = entries.findIndex(([key]) => key === colName);
                    
                    entries.splice(index + 1, 0, [newColName, description]);

                    return Object.fromEntries(entries);
                });
            }
        });
    }

    return processedDfs;
}
