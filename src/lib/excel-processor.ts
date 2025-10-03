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

    const nfe = processedDfs["NF-Stock NFE"] || [];
    const cte = processedDfs["NF-Stock CTE"] || [];
    const allNotes = [...nfe, ...cte];
    
    processedDfs["Notas Canceladas"] = allNotes.filter(row => row && canceledKeys.has(normalizeKey(row['Chave de acesso'])));
    processedDfs["NF-Stock NFE Operação Não Realizada"] = allNotes.filter(row => row && exceptionKeys.OperacaoNaoRealizada.has(normalizeKey(row['Chave de acesso'])));
    processedDfs["NF-Stock NFE Operação Desconhecida"] = allNotes.filter(row => row && exceptionKeys.Desconhecimento.has(normalizeKey(row['Chave de acesso'])));
    processedDfs["NF-Stock CTE Desacordo de Serviço"] = allNotes.filter(row => row && exceptionKeys.Desacordo.has(normalizeKey(row['Chave de acesso'])));
    processedDfs["Estornos"] = allNotes.filter(row => row && exceptionKeys.Estorno.has(normalizeKey(row['Chave de acesso'])));


    const exceptionKeySet = new Set([
        ...Array.from(canceledKeys),
        ...Array.from(exceptionKeys.OperacaoNaoRealizada),
        ...Array.from(exceptionKeys.Desconhecimento),
        ...Array.from(exceptionKeys.Desacordo),
        ...Array.from(exceptionKeys.Estorno),
    ]);
    
    const ownEmissionNotes: any[] = [];
    const ownEmissionValidKeys = new Set<string>();

    const allNfeNotes = (processedDfs["NF-Stock NFE"] || []);

    if (companyCnpj) {
        allNfeNotes.forEach(nota => {
            if (nota && nota['Emitente CPF/CNPJ'] === companyCnpj) {
                ownEmissionNotes.push(nota);
                
                const firstItemCfop = nota.itens?.[0]?.CFOP;
                const cfop = String(firstItemCfop || '');
                const isCfopEntrada = cfop.startsWith('1') || cfop.startsWith('2');
                const cleanKey = normalizeKey(nota['Chave de acesso']);

                if (nota.uploadSource === 'saida') {
                     if (!exceptionKeySet.has(cleanKey)) {
                        ownEmissionValidKeys.add(cleanKey);
                     }
                } else if (nota.uploadSource === 'entrada' && !isCfopEntrada) {
                     if (!exceptionKeySet.has(cleanKey)) {
                        ownEmissionValidKeys.add(cleanKey);
                     }
                }
            }
        });
    }

    processedDfs["Emissão Própria"] = ownEmissionNotes;

    // Filter out own emission returns and exceptions from 'Notas Válidas'
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

    processedDfs["NF-Stock Emitidas"] = (processedDfs["NF-Stock Emitidas"] || []).filter(row => row && !canceledKeys.has(normalizeKey(row['Chave de acesso'])));
    
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
