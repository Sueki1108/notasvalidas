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


export function processDataFrames(dfs: DataFrames): DataFrames {
    const processedDfs: DataFrames = JSON.parse(JSON.stringify(dfs));

    // Step 1: Unify NFE and CTE
    let nfeData = (processedDfs["NF-Stock NFE"] || []).map(row => {
        if (!row) return row;
        return {
            ...row,
            'Chave de acesso': row['Chave de acesso'] ?? row['Chave'],
            'CPF/CNPJ': row['CPF/CNPJ'] ?? row['Emitente CPF/CNPJ'],
        };
    });

    let cteData = (processedDfs["NF-Stock CTE"] || []).map(row => {
        if (!row) return row;
        return {
            ...row,
            'Valor': row['Valor da Prestação'] ?? row['Valor'],
            'CPF/CNPJ': row['Tomador CPF/CNPJ'] ?? row['CPF/CNPJ'],
            'Chave de acesso': row['Chave de Acesso'] ?? row['Chave de acesso'] ?? row['Chave'],
        };
    });

    let notasTemporaria = [...nfeData, ...cteData];
    
    // Create Chave Unica
    notasTemporaria = notasTemporaria.map(row => {
        if(row && row["Número"] !== undefined && row["CPF/CNPJ"] !== undefined) {
            const chaveUnica = cleanAndToStr(row["Número"]) + cleanAndToStr(row["CPF/CNPJ"]);
            return { "Chave Unica": chaveUnica, ...row };
        }
        return row;
    });
    
    const phrasesToRemove = ["TOTAL", "Valor total das notas", "Valor Total da Prestação"];
    notasTemporaria = notasTemporaria.filter(row => {
        if (!row || Object.keys(row).length === 0) return false;
        const isRowEffectivelyEmpty = Object.values(row).every(value => value === null || String(value).trim() === '');
        if (isRowEffectivelyEmpty) return false;
        return !Object.values(row).some(value => 
            typeof value === 'string' && phrasesToRemove.some(phrase => value.toUpperCase().includes(phrase.toUpperCase()))
        );
    });

    const originalItens = (processedDfs["NF-Stock Itens"] || []).map(row => {
        if (row && row["Número"] !== undefined && row["CPF/CNPJ"] !== undefined) {
            const chaveUnica = cleanAndToStr(row["Número"]) + cleanAndToStr(row["CPF/CNPJ"]);
            return { "Chave Unica": chaveUnica, ...row };
        }
        return row;
    });

    // Step 2: Identify and separate exceptions
    const chavesUnicasARemover = new Set<string>();

    processedDfs["Notas Canceladas"] = notasTemporaria.filter(row => row && row["Status"] === "Canceladas");
    processedDfs["Notas Canceladas"].forEach(row => {
        if (row && row["Chave Unica"]) {
            chavesUnicasARemover.add(cleanAndToStr(row["Chave Unica"]));
        }
    });

    const chavesEmissaoPropria = new Set<string>();
    if (originalItens) {
        originalItens.forEach(item => {
            if (item && item["CFOP"]) {
                const cfop = cleanAndToStr(item["CFOP"]);
                if (cfop.startsWith('1') || cfop.startsWith('2')) {
                    chavesEmissaoPropria.add(cleanAndToStr(item["Chave Unica"]));
                }
            }
        });
    }
    
    processedDfs["Emissão Própria"] = notasTemporaria.filter(row => 
        row && row["Chave Unica"] && chavesEmissaoPropria.has(cleanAndToStr(row["Chave Unica"]))
    );
    processedDfs["Emissão Própria"].forEach(row => {
        if(row && row["Chave Unica"]) {
            chavesUnicasARemover.add(cleanAndToStr(row["Chave Unica"]));
        }
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
                    const chaveUnica = (row["Número"] && row["CPF/CNPJ"]) 
                        ? cleanAndToStr(row["Número"]) + cleanAndToStr(row["CPF/CNPJ"])
                        : row["Chave Unica"];
                    if (chaveUnica) chavesUnicasARemover.add(cleanAndToStr(chaveUnica));
                    const { Chave, ...rest } = row;
                    return { 'Chave de acesso': Chave, ...rest };
                });
            }
        }
    });
    
    processedDfs["Notas Válidas"] = notasTemporaria.filter(row => 
        row && row["Chave Unica"] && !chavesUnicasARemover.has(cleanAndToStr(row["Chave Unica"]))
    );
    
    const chavesFinaisValidas = new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave Unica"])).filter(Boolean));

    if (originalItens) {
        processedDfs["Itens Válidos"] = originalItens.filter(row => 
            row && row["Chave Unica"] && chavesFinaisValidas.has(cleanAndToStr(row["Chave Unica"]))
        );
    } else {
        processedDfs["Itens Válidos"] = [];
    }

    const chavesRecebidasValidas = new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave de acesso"])).filter(Boolean));
    
    const notasEmitidas = processedDfs["NF-Stock Emitidas"] || [];
    const chavesEmitidasValidas = new Set<string>();
    if (notasEmitidas.length > 0) {
        notasEmitidas.forEach(row => {
            if (row && row["Status"] !== "Canceladas" && row["Chave de acesso"]) {
                chavesEmitidasValidas.add(cleanAndToStr(row["Chave de acesso"]));
            }
        });
    }

    const combinedChavesValidas = new Set([...chavesRecebidasValidas, ...chavesEmitidasValidas]);
    processedDfs["Chaves Válidas"] = Array.from(combinedChavesValidas).map(key => ({ "Chave de acesso": key }));
    
    if (processedDfs["Itens Válidos"] && processedDfs["Itens Válidos"].length > 0 && processedDfs["Itens Válidos"][0]?.["Valor Unitário"]) {
        processedDfs["Imobilizados"] = processedDfs["Itens Válidos"].filter(row => {
            if (!row || !row["Valor Unitário"]) return false;
            const valor = parseFloat(String(row["Valor Unitário"]).replace(',', '.'));
            return !isNaN(valor) && valor > 1200.00;
        });
    } else {
        processedDfs["Imobilizados"] = [];
    }

    for (const sheetName in processedDfs) {
        const df = processedDfs[sheetName];
        if (df && df.length > 0 && df[0] && "CFOP" in df[0] && !("Descricao CFOP" in df[0])) {
            processedDfs[sheetName] = df.map(row => {
                if (!row || !("CFOP" in row)) return row;

                const cfopCode = parseInt(cleanAndToStr(row["CFOP"]), 10);
                const description = cfopDescriptions[cfopCode] || '';
                
                const newRow: { [key: string]: any } = {};
                for (const key in row) {
                    newRow[key] = row[key];
                    if (key === "CFOP") {
                        newRow["Descricao CFOP"] = description;
                    }
                }
                return newRow;
            });
        }
    }
    
    delete processedDfs["NF-Stock NFE"];
    delete processedDfs["NF-Stock CTE"];
    delete processedDfs["NF-Stock Itens"];
    delete processedDfs["NF-Stock Emitidas"];
    delete processedDfs["NF-Stock Emitidas Itens"];

    return processedDfs;
}
