import { cfopDescriptions } from './cfop';

type DataFrame = any[];
type DataFrames = { [key: string]: DataFrame };

type ExceptionKeys = {
    OperacaoNaoRealizada: Set<string>;
    Desconhecimento: Set<string>;
    Desacordo: Set<string>;
    Estorno: Set<string>;
}

const normalizeKey = (value: any): string => {
    if (value === null || typeof value === 'undefined') {
        return "";
    }
    return String(value).replace(/\D/g, '').trim();
};


export function processDataFrames(dfs: DataFrames, canceledKeys: Set<string>, exceptionKeys: ExceptionKeys, companyCnpj: string | null): DataFrames {
    const processedDfs: DataFrames = JSON.parse(JSON.stringify(dfs));

    const nfe = (processedDfs["NF-Stock NFE"] || []).map(d => ({ ...d, docType: 'NFe' }));
    const cte = (processedDfs["NF-Stock CTE"] || []).map(d => ({ ...d, docType: 'CTe' }));
    let allNotes = [...nfe, ...cte];
    
    // 1. Isolate Canceled Notes First
    processedDfs["Notas Canceladas"] = allNotes.filter(row => row && canceledKeys.has(normalizeKey(row['Chave de acesso'])));
    
    // 2. Remove canceled notes from the main pool to ensure they don't appear anywhere else.
    allNotes = allNotes.filter(row => row && !canceledKeys.has(normalizeKey(row['Chave de acesso'])));

    // Process other exceptions from the now clean 'allNotes' pool
    processedDfs["NF-Stock NFE Operação Não Realizada"] = allNotes.filter(row => row && exceptionKeys.OperacaoNaoRealizada.has(normalizeKey(row['Chave de acesso'])));
    processedDfs["NF-Stock NFE Operação Desconhecida"] = allNotes.filter(row => row && exceptionKeys.Desconhecimento.has(normalizeKey(row['Chave de acesso'])));
    processedDfs["NF-Stock CTE Desacordo de Serviço"] = allNotes.filter(row => row && exceptionKeys.Desacordo.has(normalizeKey(row['Chave de acesso'])));
    processedDfs["Estornos"] = allNotes.filter(row => row && exceptionKeys.Estorno.has(normalizeKey(row['Chave de acesso'])));


    const exceptionKeySet = new Set([
        // ...Array.from(canceledKeys), // No longer needed here as they are already filtered out
        ...Array.from(exceptionKeys.OperacaoNaoRealizada),
        ...Array.from(exceptionKeys.Desconhecimento),
        ...Array.from(exceptionKeys.Desacordo),
        ...Array.from(exceptionKeys.Estorno),
    ]);
    
    const ownEmissionNotes: any[] = [];
    const ownEmissionValidKeys = new Set<string>();

    const allNfeNotes = allNotes.filter(n => n.docType === 'NFe');

    if (companyCnpj) {
        allNfeNotes.forEach(nota => {
            if (nota && nota['Emitente CPF/CNPJ'] === companyCnpj) {
                ownEmissionNotes.push(nota);
                
                const cleanKey = normalizeKey(nota['Chave de acesso']);

                if (!exceptionKeySet.has(cleanKey)) {
                     if (nota.uploadSource === 'saida' || nota.isOwnEmissionDevolution) {
                        ownEmissionValidKeys.add(cleanKey);
                     }
                }
            }
        });
    }

    processedDfs["Emissão Própria"] = ownEmissionNotes;

    const notasValidas = allNotes.filter(row =>
        row &&
        !exceptionKeySet.has(normalizeKey(row['Chave de acesso'])) &&
        !ownEmissionNotes.some(own => normalizeKey(own['Chave de acesso']) === normalizeKey(row['Chave de acesso'])) &&
        !row.isOwnEmissionDevolution
    );
    
    processedDfs["Notas Válidas"] = notasValidas;

    const chavesValidasEntrada = new Set(notasValidas.map(row => row && normalizeKey(row["Chave de acesso"])).filter(Boolean));
    const combinedChavesValidas = new Set([...chavesValidasEntrada, ...ownEmissionValidKeys]);
    processedDfs["Chaves Válidas"] = Array.from(combinedChavesValidas).map(key => ({ "Chave de acesso": key }));
    
    processedDfs["Itens de Entrada"] = (dfs["Itens de Entrada"] || []).filter(row => 
        row && chavesValidasEntrada.has(normalizeKey(row["Chave de acesso"]))
    );
     processedDfs["Itens de Saída"] = (dfs["Itens de Saída"] || []).filter(row => 
        row && ownEmissionValidKeys.has(normalizeKey(row["Chave de acesso"]))
    );

    // This sheet is deprecated and will be removed, but we clear it for safety
    processedDfs["NF-Stock Emitidas"] = [];
    
    if (processedDfs["Itens de Entrada"] && processedDfs["Itens de Entrada"].length > 0) {
        processedDfs["Imobilizados"] = processedDfs["Itens de Entrada"].filter(row => {
            if (!row || !row["Valor Unitário"]) return false;
            const valor = parseFloat(String(row["Valor Unitário"]).replace(',', '.'));
            return !isNaN(valor) && valor > 1200.00;
        });
    } else {
        processedDfs["Imobilizados"] = [];
    }

    ['Itens de Entrada', 'Itens de Saída'].forEach(sheetName => {
        const df = processedDfs[sheetName];
        if (df && df.length > 0 && df[0] && "CFOP" in df[0] && !("Descricao CFOP" in df[0])) {
            processedDfs[sheetName] = df.map(row => {
                if (!row || !("CFOP" in row)) return row;
                
                const cfopCode = parseInt(normalizeKey(row["CFOP"]), 10);
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

    delete processedDfs["NF-Stock NFE"];
    delete processedDfs["NF-Stock CTE"];

    return processedDfs;
}
