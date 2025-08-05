
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
    
    // Create Chave Unica in all relevant sheets first
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

    const originalItens = processedDfs["NF-Stock Itens"] || [];

    // Step 1: Unify NFE and CTE and remove total rows
    let notasTemporaria = [
        ...(processedDfs["NF-Stock NFE"] || []),
        ...(processedDfs["NF-Stock CTE"] || [])
    ];
    
    const phrasesToRemove = ["TOTAL", "Valor total das notas", "Valor Total da Prestação"];
    notasTemporaria = notasTemporaria.filter(row => {
        if (!row || Object.keys(row).length === 0) return false;
        const isRowEffectivelyEmpty = Object.values(row).every(value => value === null || String(value).trim() === '');
        if (isRowEffectivelyEmpty) return false;
        return !Object.values(row).some(value => 
            typeof value === 'string' && phrasesToRemove.some(phrase => value.toUpperCase().includes(phrase.toUpperCase()))
        );
    });

    // Step 2: Identify and separate exceptions
    const chavesUnicasARemover = new Set<string>();

    // Exception: Canceladas
    processedDfs["Notas Canceladas"] = notasTemporaria.filter(row => row && row["Status"] === "Canceladas");
    processedDfs["Notas Canceladas"].forEach(row => {
        if (row && row["Chave Unica"]) {
            chavesUnicasARemover.add(cleanAndToStr(row["Chave Unica"]));
        }
    });

    // Exception: Emissão Própria (CFOP starting with '1' or '2')
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
    
    // Exception: Loaded exception sheets
    const exceptionSheets = [
        "NF-Stock NFE Operação Não Realizada",
        "NF-Stock NFE Operação Desconhecida",
        "NF-Stock CTE Desacordo de Serviço"
    ];
    
    exceptionSheets.forEach(sheetName => {
        if (processedDfs[sheetName]) {
             if (processedDfs[sheetName].length > 0 && 'Chave' in processedDfs[sheetName][0]) {
                processedDfs[sheetName] = processedDfs[sheetName].map(row => {
                    const { Chave, ...rest } = row;
                    return { 'Chave de acesso': Chave, ...rest };
                });
            }
            processedDfs[sheetName].forEach(row => {
                // These sheets might not have 'Chave Unica', so we create it if needed for removal logic
                if (row && row["Número"] && row["CPF/CNPJ"]) {
                     const chaveUnica = cleanAndToStr(row["Número"]) + cleanAndToStr(row["CPF/CNPJ"]);
                     chavesUnicasARemover.add(chaveUnica);
                } else if (row && row["Chave Unica"]) {
                     chavesUnicasARemover.add(cleanAndToStr(row["Chave Unica"]));
                }
            });
        }
    });
    
    // Step 3: Create final "Notas Válidas"
    processedDfs["Notas Válidas"] = notasTemporaria.filter(row => 
        row && row["Chave Unica"] && !chavesUnicasARemover.has(cleanAndToStr(row["Chave Unica"]))
    );
    
    // Step 4: Create "Itens Válidos" and "Chaves Válidas" from "Notas Válidas"
    const chavesFinaisValidas = new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave Unica"])).filter(Boolean));

    if (originalItens) {
        processedDfs["Itens Válidos"] = originalItens.filter(row => 
            row && row["Chave Unica"] && chavesFinaisValidas.has(cleanAndToStr(row["Chave Unica"]))
        );
    } else {
        processedDfs["Itens Válidos"] = [];
    }

    const chavesAcessoValidas = [...new Set(processedDfs["Notas Válidas"].map(row => row && cleanAndToStr(row["Chave de acesso"])).filter(Boolean))];
    processedDfs["Chaves Válidas"] = chavesAcessoValidas.map(key => ({ "Chave de acesso": key }));
    
    // Step 5: Create "Imobilizados" from "Itens Válidos" (without removing from the source)
    if (processedDfs["Itens Válidos"] && processedDfs["Itens Válidos"].length > 0 && processedDfs["Itens Válidos"][0]?.["Valor Unitário"]) {
        processedDfs["Imobilizados"] = processedDfs["Itens Válidos"].filter(row => {
            if (!row || !row["Valor Unitário"]) return false;
            const valor = parseFloat(String(row["Valor Unitário"]).replace(',', '.'));
            return !isNaN(valor) && valor > 1200.00;
        });
    } else {
        processedDfs["Imobilizados"] = [];
    }

    // Step 6: Create a map of Chave Unica to CFOP from the original items sheet
    const chaveUnicaToCfopMap = new Map<string, string>();
    if (originalItens.length > 0) {
        for(const item of originalItens) {
            if (item && item["Chave Unica"] && item["CFOP"]) {
                const chaveUnica = cleanAndToStr(item["Chave Unica"]);
                // Only map the first CFOP found for a given key
                if (!chaveUnicaToCfopMap.has(chaveUnica)) {
                    chaveUnicaToCfopMap.set(chaveUnica, cleanAndToStr(item["CFOP"]));
                }
            }
        }
    }

    // Step 7: Add CFOP to specific note sheets that need it
    const sheetsToAddCfopToNotes = [
        "Notas Válidas", 
        "NF-Stock NFE Operação Não Realizada", 
        "Notas Canceladas", 
        "Emissão Própria",
        "NF-Stock NFE Operação Desconhecida"
    ];

    for (const sheetName of sheetsToAddCfopToNotes) {
        if (processedDfs[sheetName] && processedDfs[sheetName].length > 0) {
            processedDfs[sheetName] = processedDfs[sheetName].map(row => {
                if (row && row["Chave Unica"]) {
                    const chaveUnica = cleanAndToStr(row["Chave Unica"]);
                    const cfopCodeStr = chaveUnicaToCfopMap.get(chaveUnica);
                    if (cfopCodeStr) {
                         return { ...row, "CFOP": cfopCodeStr };
                    }
                }
                return { ...row, "CFOP": "" }; // Add empty CFOP if not found
            });
        }
    }

    // Step 8: Final loop to add CFOP description wherever CFOP exists, ensuring order
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
    
    // Step 9: Remove original sheets that will not be displayed
    delete processedDfs["NF-Stock NFE"];
    delete processedDfs["NF-Stock CTE"];
    delete processedDfs["NF-Stock Itens"];

    return processedDfs;
}
