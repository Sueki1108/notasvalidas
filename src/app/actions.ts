// src/app/actions.ts
'use server';

import * as XLSX from 'xlsx';
import { processDataFrames } from '@/lib/excel-processor';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

// Type for the file data structure expected by the processor
type DataFrames = { [key: string]: any[] };

type SpedInfo = {
    cnpj: string;
    companyName: string;
    competence: string;
}

const findDuplicates = (arr: string[]): string[] => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of arr) {
        if (seen.has(item)) {
            duplicates.add(item);
        } else {
            seen.add(item);
        }
    }
    return Array.from(duplicates);
};

const parseSpedInfo = (spedLine: string): SpedInfo | null => {    
    if (!spedLine || !spedLine.startsWith('|0000|')) {
        return null;
    }
    
    const parts = spedLine.split('|');
    if (parts.length < 10) {
        return null;
    }
    
    const startDate = parts[4]; 
    const companyName = parts[6];
    const cnpj = parts[7];

    if (!startDate || !companyName || !cnpj || startDate.length !== 8) {
        return null;
    }

    const month = startDate.substring(2, 4);
    const year = startDate.substring(4, 8);
    const competence = `${month}/${year}`;

    return { cnpj, companyName, competence };
};

const extractNfeDataFromXml = (xmlContent: string) => {
    const getValue = (tag: string) => (xmlContent.split(`<${tag}>`)[1] || '').split(`</${tag}>`)[0];
    const getNestedValue = (parentTag: string, childTag: string) => {
        const parentContent = xmlContent.split(`<${parentTag}>`)[1] || '';
        return (parentContent.split(`<${childTag}>`)[1] || '').split(`</${childTag}>`)[0];
    };
    
    const chNFe = getValue('chNFe');
    
    const nNF = getValue('nNF');
    const dhEmi = getValue('dhEmi');
    const vNF = getValue('vNF');
    const cStat = getValue('cStat');
    const emitCNPJ = getNestedValue('emit', 'CNPJ');
    const emitXNome = getNestedValue('emit', 'xNome');
    const destCNPJ = getNestedValue('dest', 'CNPJ');
    const destXNome = getNestedValue('dest', 'xNome');
    const tpNF = getValue('tpNF'); // 0 for entry, 1 for exit

    const nota = {
        'Chave de acesso': `NFe${chNFe}`,
        'Número': nNF,
        'Data de Emissão': dhEmi,
        'Valor': parseFloat(vNF),
        'Status': parseInt(cStat) === 100 ? 'Autorizadas' : (parseInt(cStat) === 101 ? 'Canceladas' : 'Outro Status'),
        'Emitente CPF/CNPJ': emitCNPJ,
        'Emitente': emitXNome,
        'Destinatário CPF/CNPJ': destCNPJ,
        'Destinatário': destXNome
    };
    
    const isSaida = tpNF === '1';

    const detSection = xmlContent.split('<det ');
    const itens = detSection.slice(1).map(section => {
        const prodSection = (section.split('<prod>')[1] || '').split('</prod>')[0];
        const getProdValue = (tag: string) => (prodSection.split(`<${tag}>`)[1] || '').split(`</${tag}>`)[0];
        return {
            'Chave de acesso': `NFe${chNFe}`,
            'Número': nNF,
            'CPF/CNPJ': isSaida ? destCNPJ : emitCNPJ,
            'CFOP': getProdValue('CFOP'),
            'Código': getProdValue('cProd'),
            'Descrição': getProdValue('xProd'),
            'NCM': getProdValue('NCM'),
            'Quantidade': parseFloat(getProdValue('qCom')),
            'Valor Unitário': parseFloat(getProdValue('vUnCom')),
            'Valor Total': parseFloat(getProdValue('vProd')),
        };
    });
    
    return { nota, itens, isSaida };
}

const extractCteDataFromXml = (xmlContent: string) => {
    const getValue = (tag: string) => (xmlContent.split(`<${tag}>`)[1] || '').split(`</${tag}>`)[0];
    const getNestedValue = (parentTag: string, childTag: string) => {
        const parentContent = xmlContent.split(`<${parentTag}>`)[1] || '';
        return (parentContent.split(`<${childTag}>`)[1] || '').split(`</${childTag}>`)[0];
    };
    
    const chCTe = getValue('chCTe');
    const nCT = getValue('nCT');
    const dhEmi = getValue('dhEmi');
    const vTPrest = getValue('vTPrest');
    const cStat = getValue('cStat');
    const tomaCNPJ = getNestedValue('toma', 'CNPJ') || getNestedValue('toma', 'CPF');
    const tomaXNome = getNestedValue('toma', 'xNome');
    
    const nota = {
        'Chave de acesso': `CTe${chCTe}`,
        'Número': nCT,
        'Data de Emissão': dhEmi,
        'Valor da Prestação': parseFloat(vTPrest),
        'Status': parseInt(cStat) === 100 ? 'Autorizadas' : 'Outro Status',
        'Tomador CPF/CNPJ': tomaCNPJ,
        'Tomador': tomaXNome,
    };
    
    return { nota, isSaida: false }; // CTe is always "entrada" in this context
}


export async function processUploadedFiles(formData: FormData) {
  try {
    const dataFrames: DataFrames = {};
    let spedInfo: SpedInfo | null = null;
    let spedFileContent = '';
    
    const nfeEntrada: any[] = [];
    const nfeItensEntrada: any[] = [];
    const cteEntrada: any[] = [];
    const nfeSaida: any[] = [];
    const nfeItensSaida: any[] = [];
    
    // Read all files from FormData
    for (const [category, file] of formData.entries()) {
        const fileContent = await (file as File).text();

        if (category === "XMLs de Entrada (NFe)") {
            const xmlData = extractNfeDataFromXml(fileContent);
            if(xmlData) {
                nfeEntrada.push(xmlData.nota);
                nfeItensEntrada.push(...xmlData.itens);
            }
        } else if (category === "XMLs de Entrada (CTe)") {
            const xmlData = extractCteDataFromXml(fileContent);
            if(xmlData) {
                cteEntrada.push(xmlData.nota);
            }
        } else if (category === "XMLs de Saída") {
            const xmlData = extractNfeDataFromXml(fileContent);
            if(xmlData) {
                nfeSaida.push(xmlData.nota);
                nfeItensSaida.push(...xmlData.itens);
            }
        } else if (category === 'SPED TXT') {
            spedFileContent = fileContent;
        } else { // Exception spreadsheets
            const sheetName = category; // The key is the sheet name
            if (!dataFrames[sheetName]) dataFrames[sheetName] = [];
            const buffer = await (file as File).arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            for (const wsName of workbook.SheetNames) {
              const worksheet = workbook.Sheets[wsName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet);
              dataFrames[sheetName].push(...jsonData);
            }
        }
    }
    
    dataFrames['NF-Stock NFE'] = nfeEntrada;
    dataFrames['NF-Stock Itens'] = nfeItensEntrada;
    dataFrames['NF-Stock CTE'] = cteEntrada;
    dataFrames['NF-Stock Emitidas'] = nfeSaida;
    dataFrames['NF-Stock Emitidas Itens'] = nfeItensSaida;

    let allSpedKeys: string[] = [];
    if (spedFileContent) {
        const lines = spedFileContent.split('\n');
        const keyPattern = /\b\d{44}\b/g;
        
        if (lines.length > 0 && lines[0]) {
            spedInfo = parseSpedInfo(lines[0].trim());
        }
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            const matches = trimmedLine.match(keyPattern);
            if (matches) {
                allSpedKeys.push(...matches.map(key => key.startsWith('NFe') ? key.substring(3) : (key.startsWith('CTe') ? key.substring(3) : key)));
            }
        }
    }
    
    const processedData = processDataFrames(dataFrames);

    let keyCheckResults = null;
    const keysInTxt = new Set(allSpedKeys);
    if (processedData['Chaves Válidas']) {
        const spreadsheetKeysArray = processedData['Chaves Válidas'].map(row => {
            const key = String(row['Chave de acesso']).trim();
            return key.startsWith('NFe') ? key.substring(3) : (key.startsWith('CTe') ? key.substring(3) : key);
        }).filter(key => key);
        const spreadsheetKeys = new Set(spreadsheetKeysArray);
        
        const keysNotFoundInTxt = [...spreadsheetKeys].filter(key => !keysInTxt.has(key));
        const keysInTxtNotInSheet = [...keysInTxt].filter(key => !spreadsheetKeys.has(key));
        
        const duplicateKeysInSheet = findDuplicates(spreadsheetKeysArray);
        const duplicateKeysInTxt = findDuplicates(allSpedKeys);

        keyCheckResults = { 
            keysNotFoundInTxt, 
            keysInTxtNotInSheet,
            duplicateKeysInSheet,
            duplicateKeysInTxt,
        };
    }
    
    if (spedInfo && spedInfo.cnpj) {
        const allProcessedKeys = processedData['Chaves Válidas']?.map(row => row['Chave de acesso']) || [];
        const keysNotFoundInSpedSet = new Set((keyCheckResults as any)?.keysNotFoundInTxt || []);
        
        const keysFromSheet = allProcessedKeys.map(key => ({
            key: key,
            foundInSped: !keysNotFoundInSpedSet.has(key),
            origin: 'planilha',
            comment: ''
        }));
        
        const keysOnlyInSped = ((keyCheckResults as any)?.keysInTxtNotInSheet || []).map((key: string) => ({
            key: key,
            foundInSped: true,
            origin: 'sped',
            comment: ''
        }));

        const verificationKeys = [...keysFromSheet, ...keysOnlyInSped];

        const verificationData = {
            ...spedInfo,
            keys: verificationKeys,
            verifiedAt: serverTimestamp(),
        };

        await setDoc(doc(db, "verifications", spedInfo.cnpj), verificationData, { merge: true });
    }

    return { data: processedData, keyCheckResults, spedInfo };
  } catch (error: any) {
    console.error('Error processing files:', error);
    return { error: error.message || 'An unexpected error occurred during file processing.' };
  }
}

export async function addOrUpdateKeyComment(cnpj: string, key: string, comment: string) {
    if (!cnpj || !key) {
        return { error: "CNPJ e Chave são obrigatórios." };
    }

    try {
        const verificationRef = doc(db, "verifications", cnpj);
        const docSnap = await getDoc(verificationRef);

        if (!docSnap.exists()) {
            return { error: "Verificação não encontrada para este CNPJ." };
        }

        const data = docSnap.data();
        const keys = data.keys || [];

        const keyIndex = keys.findIndex((k: any) => k.key === key);

        if (keyIndex === -1) {
             return { error: "Chave não encontrada no histórico de verificação." };
        }
        
        const updatedKeys = [...keys];
        updatedKeys[keyIndex] = { ...updatedKeys[keyIndex], comment: comment };
        
        await updateDoc(verificationRef, { keys: updatedKeys });
        
        return { success: true, message: "Comentário salvo com sucesso!" };

    } catch (error: any) {
        console.error("Erro ao salvar comentário:", error);
        return { error: error.message || "Ocorreu um erro ao salvar o comentário." };
    }
}

export async function mergeExcelFiles(formData: FormData) {
    try {
        const fileEntries = formData.getAll('files') as File[];
        const mergedWorkbook = XLSX.utils.book_new();
        
        const sheetsData: { [sheetName: string]: any[] } = {};

        for (const file of fileEntries) {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            
            for (const sheetName of workbook.SheetNames) {
                if (!sheetsData[sheetName]) {
                    sheetsData[sheetName] = [];
                }
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                sheetsData[sheetName].push(...jsonData);
            }
        }
        
        if (Object.keys(sheetsData).length === 0) {
            return { error: "Nenhuma planilha encontrada nos arquivos carregados." };
        }

        for (const sheetName in sheetsData) {
            if (sheetsData[sheetName].length > 0) {
                const worksheet = XLSX.utils.json_to_sheet(sheetsData[sheetName]);
                XLSX.utils.book_append_sheet(mergedWorkbook, worksheet, sheetName);
            }
        }

        if (mergedWorkbook.SheetNames.length === 0) {
            return { error: "Nenhum dado válido encontrado para agrupar." };
        }
        
        const buffer = XLSX.write(mergedWorkbook, { bookType: 'xlsx', type: 'array' });
        
        const base64 = Buffer.from(buffer).toString('base64');
        
        return { base64Data: base64 };

    } catch (error: any) {
        console.error("Erro ao agrupar planilhas:", error);
        return { error: error.message || "Ocorreu um erro ao agrupar as planilhas." };
    }
}
