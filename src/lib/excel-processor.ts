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


export function processDataFrames(dfs: DataFrames, canceledKeys: Set<string>, exceptionKeys: ExceptionKeys, companyCnpj?: string | null): DataFrames {
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
    
    const ownEmissionNotes: any[] = [];
    const ownEmissionValidKeys = new Set<string>();

    if (companyCnpj) {
        (processedDfs["NF-Stock NFE"] || []).forEach(nota => {
            if (nota && nota['Emitente CPF/CNPJ'] === companyCnpj) {
                ownEmissionNotes.push(nota);
                // A nota de emissão própria só é válida se veio da pasta de saída
                if (nota.uploadSource === 'saida') {
                    ownEmissionValidKeys.add(cleanAndToStr(nota['Chave de acesso']));
                }
            }
        });
    }
    
    // Separa as notas de emissão própria em sua própria aba
    processedDfs["Emissão Própria"] = ownEmissionNotes;
    const ownEmissionAllKeys = new Set(ownEmissionNotes.map(n => cleanAndToStr(n['Chave de acesso'])));

    // Filter valid notes: must not be canceled or an exception. Own emissions are handled separately.
    const notasValidas = allNotes.filter(row =>
        row &&
        !canceledKeys.has(row['Chave de acesso']) &&
        !exceptionKeySet.has(row['Chave de acesso']) &&
        !ownEmissionAllKeys.has(row['Chave de acesso']) // Exclude ALL own emission from this primary list
    );
    
    processedDfs["Notas Válidas"] = notasValidas;

    // "Chaves Válidas" inclui: chaves de notas de entrada válidas + chaves de emissão própria válidas (as de saída)
    const chavesValidasEntrada = new Set(notasValidas.map(row => row && cleanAndToStr(row["Chave de acesso"])).filter(Boolean));
    const combinedChavesValidas = new Set([...chavesValidasEntrada, ...ownEmissionValidKeys]);
    processedDfs["Chaves Válidas"] = Array.from(combinedChavesValidas).map(key => ({ "Chave de acesso": key }));

    
    // Filter items based on valid keys
    processedDfs["Itens de Entrada"] = (dfs["Itens de Entrada"] || []).filter(row => 
        row && chavesValidasEntrada.has(cleanAndToStr(row["Chave de acesso"]))
    );
     processedDfs["Itens de Saída"] = (dfs["Itens de Saída"] || []).filter(row => 
        row && ownEmissionValidKeys.has(cleanAndToStr(row["Chave de acesso"]))
    );


    // Handle outgoing notes - remove canceled (This seems redundant if they are part of ownEmission)
    // Kept for safety in case there are other types of outgoing notes
    const notasSaidaTemporaria = processedDfs["NF-Stock Emitidas"] || [];
    processedDfs["NF-Stock Emitidas"] = notasSaidaTemporaria.filter(row => row && !canceledKeys.has(row['Chave de acesso']));
    const notasSaidaCanceladas = notasSaidaTemporaria.filter(row => row && canceledKeys.has(row['Chave de acesso']));
    processedDfs["Notas Canceladas"].push(...notasSaidaCanceladas);
    
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
