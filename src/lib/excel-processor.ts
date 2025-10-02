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
            'Chave de acesso': row['Chave de acesso'] ?? row['Chave'],
            'CPF/CNPJ': row['Emitente CPF/CNPJ'] ?? row['Destinatário CPF/CNPJ'],
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

    let notasEntradaTemporaria = [...nfeData, ...cteData];
    
    // Create Chave Unica for entry notes
    notasEntradaTemporaria = notasEntradaTemporaria.map(row => {
        if(row && row["Número"] !== undefined && row["CPF/CNPJ"] !== undefined) {
            const chaveUnica = cleanAndToStr(row["Número"]) + cleanAndToStr(row["CPF/CNPJ"]);
            return { "Chave Unica": chaveUnica, ...row };
        }
        return row;
    });

    const originalItensEntrada = (processedDfs["NF-Stock Itens"] || []).map(row => {
        if (row && row["Número"] !== undefined && row["CPF/CNPJ"] !== undefined) {
            const chaveUnica = cleanAndToStr(row["Número"]) + cleanAndToStr(row["CPF/CNPJ"]);
            return { "Chave Unica": chaveUnica, ...row };
        }
        return row;
    });
    
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

    // Add keys from cancellation events and status from XMLs to canceledKeys Set first
    notasEntradaTemporaria.forEach(row => {
        if (row && (row["Status"]?.includes('Cancelada') || canceledKeys.has(row['Chave de acesso']))) {
            canceledKeys.add(row['Chave de acesso']);
        }
    });

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
    
    // Final valid entry notes
    processedDfs["Notas Válidas"] = notasEntradaTemporaria.filter(row => 
        row && row["Chave Unica"] && !chavesUnicasARemover.has(cleanAndToStr(row["Chave Unica"]))
    );
    
    const chavesFinaisValidas = new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave Unica"])).filter(Boolean));

    processedDfs["Itens Válidos"] = originalItensEntrada.filter(row => 
        row && row["Chave Unica"] && chavesFinaisValidas.has(cleanAndToStr(row["Chave Unica"]))
    );

    // Handle outgoing notes
    processedDfs["NF-Stock Emitidas"] = filterRows(processedDfs["NF-Stock Emitidas"] || []).filter(row => row && !canceledKeys.has(row['Chave de acesso']));
    processedDfs["Itens de Saída"] = (processedDfs["NF-Stock Emitidas Itens"] || []).filter(item => item && !canceledKeys.has(item['Chave de acesso']));
    
    // Logic for "Emissão Própria"
    const cfopsProprios = new Set<string>();
    if (processedDfs["Itens Válidos"]) {
        processedDfs["Itens Válidos"].forEach(item => {
            const cfop = String(item.CFOP);
            if (cfop.startsWith('1') || cfop.startsWith('2')) {
                const chaveUnica = cleanAndToStr(item["Chave Unica"]);
                cfopsProprios.add(chaveUnica);
            }
        });
    }
    processedDfs["Emissão Própria"] = processedDfs["Notas Válidas"].filter(nota => {
        const chaveUnica = cleanAndToStr(nota["Chave Unica"]);
        return cfopsProprios.has(chaveUnica);
    });


    const chavesRecebidasValidas = new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave de acesso"])).filter(Boolean));
    const chavesEmitidasValidas = new Set(processedDfs["NF-Stock Emitidas"].map(row => row && cleanAndToStr(row["Chave de acesso"])).filter(Boolean));

    const combinedChavesValidas = new Set([...chavesRecebidasValidas, ...chavesEmitidasValidas]);
    processedDfs["Chaves Válidas"] = Array.from(combinedChavesValidas).map(key => ({ "Chave de acesso": key }));
    
    // Immobilized assets - based on valid input items
    if (processedDfs["Itens Válidos"] && processedDfs["Itens Válidos"].length > 0) {
        processedDfs["Imobilizados"] = processedDfs["Itens Válidos"].filter(row => {
            if (!row || !row["Valor Unitário"]) return false;
            const valor = parseFloat(String(row["Valor Unitário"]).replace(',', '.'));
            return !isNaN(valor) && valor > 1200.00;
        });
    } else {
        processedDfs["Imobilizados"] = [];
    }

    // Add CFOP Descriptions
    for (const sheetName in processedDfs) {
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
    }
    
    // Cleanup temporary dataframes
    delete processedDfs["NF-Stock NFE"];
    delete processedDfs["NF-Stock CTE"];
    delete processedDfs["NF-Stock Itens"];
    // Keep NF-Stock Emitidas and Itens de Saída for display
    // delete processedDfs["NF-Stock Emitidas"];
    delete processedDfs["NF-Stock Emitidas Itens"];

    return processedDfs;
}
