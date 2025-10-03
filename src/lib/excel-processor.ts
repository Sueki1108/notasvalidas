import { cfopDescriptions } from './cfop';

type DataFrame = any[];
type DataFrames = { [key: string]: DataFrame };

type ExceptionKeys = {
    OperacaoNaoRealizada: Set<string>;
    Desconhecimento: Set<string>;
    Desacordo: Set<string>;
}

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


export function processDataFrames(dfs: DataFrames, canceledKeys: Set<string>, exceptionKeys: ExceptionKeys): DataFrames {
    const processedDfs: DataFrames = JSON.parse(JSON.stringify(dfs));

    const nfeEntrada = processedDfs["NF-Stock NFE"] || [];
    const cteEntrada = processedDfs["NF-Stock CTE"] || [];
    const allNotes = [...nfeEntrada, ...cteEntrada];
    
    processedDfs["Notas Canceladas"] = allNotes.filter(row => row && canceledKeys.has(row['Chave de acesso']));
    processedDfs["NF-Stock NFE Operação Não Realizada"] = allNotes.filter(row => row && exceptionKeys.OperacaoNaoRealizada.has(row['Chave de acesso']));
    processedDfs["NF-Stock NFE Operação Desconhecida"] = allNotes.filter(row => row && exceptionKeys.Desconhecimento.has(row['Chave de acesso']));
    processedDfs["NF-Stock CTE Desacordo de Serviço"] = allNotes.filter(row => row && exceptionKeys.Desacordo.has(row['Chave de acesso']));

    const exceptionKeySet = new Set([
        ...Array.from(exceptionKeys.OperacaoNaoRealizada),
        ...Array.from(exceptionKeys.Desconhecimento),
        ...Array.from(exceptionKeys.Desacordo),
    ]);

    const cfopsEmissaoPropria = [
        1201, 1202, 1203, 1204, 1208, 1209, 1410, 1411,
        2201, 2202, 2203, 2204, 2208, 2209, 2410, 2411
    ];

    const chavesAcessoEmissaoPropria = new Set<string>();
    const nfeNotesToProcess = (processedDfs["NF-Stock NFE"] || []);

    // Identify own emission from NFe notes based on CFOP in their items
    if (processedDfs["Itens de Entrada"]) {
        processedDfs["Itens de Entrada"].forEach(item => {
            if (item && item.CFOP && cfopsEmissaoPropria.includes(parseInt(String(item.CFOP), 10))) {
                chavesAcessoEmissaoPropria.add(cleanAndToStr(item['Chave de acesso']));
            }
        });
    }
    
    // Separate own emission notes
    processedDfs["Emissão Própria"] = nfeNotesToProcess.filter(nota => 
        nota && chavesAcessoEmissaoPropria.has(cleanAndToStr(nota['Chave de acesso']))
    );

    // Filter valid notes: must not be canceled, exception or own emission
    const notasValidas = allNotes.filter(row =>
        row &&
        !canceledKeys.has(row['Chave de acesso']) &&
        !exceptionKeySet.has(row['Chave de acesso']) &&
        !chavesAcessoEmissaoPropria.has(row['Chave de acesso'])
    );
    
    processedDfs["Notas Válidas"] = notasValidas.filter(n => n['Chave de acesso'].startsWith('NFe'));
    const notasValidasCTE = notasValidas.filter(n => n['Chave de acesso'].startsWith('CTe'));
    processedDfs["Notas Válidas"].push(...notasValidasCTE); // Combine CTe validos


    const chavesAcessoFinaisValidas = new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave de acesso"])).filter(Boolean));
    const chavesSaidaValidas = new Set((processedDfs["NF-Stock Emitidas"] || []).map(r => r['Chave de acesso']));
    
    // Filter items based on valid notes
    processedDfs["Itens de Entrada"] = (dfs["Itens de Entrada"] || []).filter(row => 
        row && chavesAcessoFinaisValidas.has(cleanAndToStr(row["Chave de acesso"]))
    );
     processedDfs["Itens de Saída"] = (dfs["Itens de Saída"] || []).filter(row => 
        row && chavesSaidaValidas.has(cleanAndToStr(row["Chave de acesso"]))
    );


    // Handle outgoing notes - remove canceled
    const notasSaidaTemporaria = processedDfs["NF-Stock Emitidas"] || [];
    processedDfs["NF-Stock Emitidas"] = notasSaidaTemporaria.filter(row => row && !canceledKeys.has(row['Chave de acesso']));
    const notasSaidaCanceladas = notasSaidaTemporaria.filter(row => row && canceledKeys.has(row['Chave de acesso']));
    processedDfs["Notas Canceladas"].push(...notasSaidaCanceladas);


    // "Chaves Válidas" should only contain keys from valid entry and valid issued notes
    const combinedChavesValidas = new Set([...chavesAcessoFinaisValidas, ...chavesSaidaValidas]);
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
