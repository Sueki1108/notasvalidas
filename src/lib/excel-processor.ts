import { cfopDescriptions } from './cfop';

type DataFrame = any[];
type DataFrames = { [key: string]: DataFrame };

// Helper to safely convert values to string for key creation
const cleanAndToStr = (value: any): string => {
    if (value === null || typeof value === 'undefined') {
        return "";
    }
    let strValue = String(value).trim();
    if (/^\d+\.0$/.test(strValue)) {
        strValue = strValue.substring(0, strValue.length - 2);
    }
    return strValue;
};


export function processDataFrames(dfs: DataFrames, canceledKeys: Set<string>): DataFrames {
    const processedDfs: DataFrames = JSON.parse(JSON.stringify(dfs));

    // Step 1: Unify NFE and CTE for entries
    let nfeData = (processedDfs["NF-Stock NFE"] || []).map(row => {
        if (!row) return row;
        return {
            ...row,
            'CPF/CNPJ': row['Emitente CPF/CNPJ'], // NFe de entrada, o emissor é o fornecedor
        };
    });

    let cteData = (processedDfs["NF-Stock CTE"] || []).map(row => {
        if (!row) return row;
        return {
            ...row,
            'Valor': row['Valor da Prestação'] ?? row['Valor'],
            'CPF/CNPJ': row['Emitente CPF/CNPJ'], // CTe, o emissor é o fornecedor do transporte
            'Chave de acesso': row['Chave de Acesso'] ?? row['Chave de acesso'] ?? row['Chave'],
        };
    });

    let notasEntradaTemporaria = [...nfeData, ...cteData];
    
    // Create Chave Unica for entry notes
    notasEntradaTemporaria = notasEntradaTemporaria.map(row => {
        if(row && row["Número"] !== undefined && row["CPF/CNPJ"] !== undefined) {
            const chaveUnica = cleanAndToStr(row["Número"]) + cleanAndToStr(row["CPF/CNPJ"]);
            return { "Chave Unica": chaveUnica, ...row };
        }
        return row;
    }).filter(row => row);

    
    // Filter out total rows
    const phrasesToRemove = ["TOTAL", "Valor total das notas", "Valor Total da Prestação"];
    const filterRows = (data: DataFrame) => data.filter(row => {
        if (!row || Object.keys(row).length === 0) return false;
        const isRowEffectivelyEmpty = Object.values(row).every(value => value === null || String(value).trim() === '');
        if (isRowEffectivelyEmpty) return false;
        return !Object.values(row).some(value => 
            typeof value === 'string' && phrasesToRemove.some(phrase => value.toUpperCase().includes(phrase.toUpperCase()))
        );
    });

    notasEntradaTemporaria = filterRows(notasEntradaTemporaria);
    
    // Step 2: Identify and separate exceptions
    const chavesUnicasARemover = new Set<string>();
    
    processedDfs["Notas Canceladas"] = notasEntradaTemporaria.filter(row => row && canceledKeys.has(row['Chave de acesso']));
    
    processedDfs["Notas Canceladas"].forEach(row => {
        if (row && row["Chave Unica"]) {
             chavesUnicasARemover.add(cleanAndToStr(row["Chave Unica"]))
        };
    });
    
    const exceptionSheets = [
        "NF-Stock NFE Operação Não Realizada",
        "NF-Stock NFE Operação Desconhecida",
        "NF-Stock CTE Desacordo de Serviço"
    ];
    
    exceptionSheets.forEach(sheetName => {
        if (processedDfs[sheetName]) {
             if (processedDfs[sheetName].length > 0) {
                processedDfs[sheetName] = processedDfs[sheetName].map(row => {
                    const chaveUnica = (row["Número"] && (row["CPF/CNPJ"] || row["Emitente CPF/CNPJ"])) 
                        ? cleanAndToStr(row["Número"]) + cleanAndToStr(row["CPF/CNPJ"] || row["Emitente CPF/CNPJ"])
                        : row["Chave Unica"];
                    if (chaveUnica) chavesUnicasARemover.add(cleanAndToStr(chaveUnica));
                    const { Chave, ...rest } = row;
                    return { 'Chave de acesso': Chave, ...rest };
                });
            }
        }
    });
    
    // Step 3: Identify "Emissão Própria" from the temporary entry notes
    const chavesAcessoEmissaoPropria = new Set<string>();
    const cfopsEmissaoPropria = [
        1201, 1202, 1203, 1204, 1208, 1209, 1410, 1411,
        2201, 2202, 2203, 2204, 2208, 2209, 2410, 2411
    ];

    if (processedDfs["Itens de Entrada"]) {
        processedDfs["Itens de Entrada"].forEach(item => {
            if (item && item.CFOP && cfopsEmissaoPropria.includes(parseInt(String(item.CFOP), 10))) {
                chavesAcessoEmissaoPropria.add(cleanAndToStr(item['Chave de acesso']));
            }
        });
    }

    processedDfs["Emissão Própria"] = notasEntradaTemporaria.filter(nota => 
        nota && chavesAcessoEmissaoPropria.has(cleanAndToStr(nota['Chave de acesso']))
    );

    // Final valid entry notes - MUST NOT include canceled, exceptions, or own emissions.
    processedDfs["Notas Válidas"] = notasEntradaTemporaria.filter(row => 
        row && 
        !canceledKeys.has(row['Chave de acesso']) &&
        (!row["Chave Unica"] || !chavesUnicasARemover.has(cleanAndToStr(row["Chave Unica"]))) &&
        !chavesAcessoEmissaoPropria.has(cleanAndToStr(row['Chave de acesso']))
    );
    
    const chavesAcessoFinaisValidas = new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave de acesso"])).filter(Boolean));

    // Filter entry items to only include items from "Notas Válidas"
    processedDfs["Itens de Entrada"] = (dfs["Itens de Entrada"] || []).filter(row => 
        row && chavesAcessoFinaisValidas.has(cleanAndToStr(row["Chave de acesso"]))
    );

    // Handle outgoing notes
    const notasSaidaTemporaria = filterRows(processedDfs["NF-Stock Emitidas"] || []);
    processedDfs["NF-Stock Emitidas"] = notasSaidaTemporaria.filter(row => row && !canceledKeys.has(row['Chave de acesso']));
    const chavesEmitidasValidas = new Set(processedDfs["NF-Stock Emitidas"].map(row => row && cleanAndToStr(row["Chave de acesso"])).filter(Boolean));
    processedDfs["Itens de Saída"] = (dfs["Itens de Saída"] || []).filter(item => item && chavesEmitidasValidas.has(item['Chave de acesso']));
    
    // Add canceled outgoing notes to the "Notas Canceladas" sheet
    const notasSaidaCanceladas = notasSaidaTemporaria.filter(row => row && canceledKeys.has(row['Chave de acesso']));
    if (!processedDfs["Notas Canceladas"]) {
        processedDfs["Notas Canceladas"] = [];
    }
    processedDfs["Notas Canceladas"].push(...notasSaidaCanceladas);

    // "Chaves Válidas" should only contain keys from valid entry and valid issued notes
    const combinedChavesValidas = new Set([...chavesAcessoFinaisValidas, ...chavesEmitidasValidas]);
    processedDfs["Chaves Válidas"] = Array.from(combinedChavesValidas).map(key => ({ "Chave de acesso": key }));
    
    // Immobilized assets - based on valid input items
    if (processedDfs["Itens de Entrada"] && processedDfs["Itens de Entrada"].length > 0) {
        processedDfs["Imobilizados"] = processedDfs["Itens de Entrada"].filter(row => {
            if (!row || !row["Valor Unitário"]) return false;
            const valor = parseFloat(String(row["Valor Unitário"]).replace(',', '.'));
            return !isNaN(valor) && valor > 1200.00;
        });
    } else {
        processedDfs["Imobilizados"] = [];
    }

    // Add CFOP Descriptions to item sheets
    ['Itens de Entrada', 'Itens de Saída'].forEach(sheetName => {
        const df = processedDfs[sheetName];
        if (df && df.length > 0 && df[0] && "CFOP" in df[0] && !("Descricao CFOP" in df[0])) {
            processedDfs[sheetName] = df.map(row => {
                if (!row || !("CFOP" in row)) return row;
                
                const cfopCode = parseInt(cleanAndToStr(row["CFOP"]), 10);
                const description = cfopDescriptions[cfopCode] || 'Descrição não encontrada';
                
                const newRow: { [key: string]: any } = {};
                let cfopPlaced = false;
                for (const key in row) {
                    newRow[key] = row[key];
                    if (key === "CFOP" && !cfopPlaced) {
                        newRow["Descricao CFOP"] = description;
                        cfopPlaced = true;
                    }
                }
                return newRow;
            });
        }
    });

    // Cleanup temporary dataframes
    delete processedDfs["NF-Stock NFE"];
    delete processedDfs["NF-Stock CTE"];

    return processedDfs;
}
