// src/app/actions.ts
'use server';

import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp, updateDoc, query, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { cfopDescriptions } from '@/lib/cfop';


// Type for the file data structure expected by the processor
type DataFrames = { [key: string]: any[] };

export type SpedInfo = {
    cnpj: string;
    companyName: string;
    competence: string;
}

export type KeyInfo = {
    key: string;
    origin: 'planilha' | 'sped';
    comment?: string;
    // Enriched data
    partnerName?: string;
    emissionDate?: string;
    value?: number;
    docType?: 'NFe' | 'CTe' | 'N/A';
    direction?: 'Entrada' | 'Saída' | 'N/A';
};


export type KeyCheckResult = {
    allSpedKeys: KeyInfo[];
    keysFoundInBoth: KeyInfo[];
    keysNotFoundInTxt: KeyInfo[];
    keysInTxtNotInSheet: KeyInfo[];
    duplicateKeysInSheet: string[];
    duplicateKeysInTxt: string[];
};

export type CfopComparisonResult = {
    [key: string]: {
        foundInBoth: any[];
        onlyInXml: any[];
        onlyInSheet: any[];
    }
};


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

const parseAllParticipants = (spedFileContent: string) => {
    const participants = new Map<string, string>();
    const lines = spedFileContent.replace(/\r\n/g, '\n').split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('|0150|')) {
            const parts = trimmedLine.split('|');
            if (parts.length > 3) {
                const code = parts[2];
                const name = parts[3];
                if (code && name) {
                    participants.set(code, name);
                }
            }
        }
    }
    return participants;
};

const parseSpedLineForData = (line: string, participants: Map<string, string>): Partial<KeyInfo> | null => {
    const parts = line.split('|');
    if (parts.length < 2) return null;

    const recordType = parts[1];
    
    let key = '';
    let direction = 'N/A';
    let docType : 'NFe' | 'CTe' | 'N/A' = 'N/A';
    let value = 0;
    let emissionDate = '';
    let partnerName = '';

    if (recordType === 'C100') {
        const docModel = parts[4]; 
        if (docModel !== '55') return null;

        const docStatus = parts[5];
        if (['02', '03', '04', '05'].includes(docStatus)) return null;
        
        key = parts[9]; 
        
        if (!key || key.length !== 44) return null;
        
        const directionValue = parts[2]; // 0 = Entrada, 1 = Saída
        direction = directionValue === '0' ? 'Entrada' : 'Saída';
        docType = 'NFe';
        value = parseFloat(parts[12] ? parts[12].replace(',', '.') : '0');
        emissionDate = parts[10]; 
        const partnerCode = parts[3];
        partnerName = participants.get(partnerCode) || '';

        return {
            key,
            value,
            emissionDate: emissionDate ? `${emissionDate.substring(0,2)}/${emissionDate.substring(2,4)}/${emissionDate.substring(4,8)}` : '',
            partnerName,
            docType,
            direction
        };
    }
    else if (recordType === 'D100') {
        const docModel = parts[4]; 
        if (docModel !== '57') return null;

        key = parts[10]; 
        
        if (!key || key.length !== 44) return null;
        
        const directionValue = parts[2];
        direction = directionValue === '0' ? 'Saída' : 'Entrada';
        docType = 'CTe';
        value = parseFloat(parts[16] ? parts[16].replace(',', '.') : '0'); 
        emissionDate = parts[9];
        const partnerCode = parts[3];
        partnerName = participants.get(partnerCode) || '';

        return {
            key,
            value,
            emissionDate: emissionDate ? `${emissionDate.substring(0,2)}/${emissionDate.substring(2,4)}/${emissionDate.substring(4,8)}` : '',
            partnerName,
            docType,
            direction
        };
    }
    return null;
}

const normalizeKey = (key: any): string => {
    if (!key) return '';
    return String(key).replace(/\D/g, '').trim();
}

const forceCellAsString = (worksheet: XLSX.WorkSheet, headerName: string) => {
    const headerAddress = Object.keys(worksheet).find(key => worksheet[key].v === headerName);
    if (!headerAddress) return;
    const headerCol = headerAddress.replace(/\d+$/, '');
    for (const key in worksheet) {
        if (key.startsWith(headerCol) && key !== headerAddress) {
            if (worksheet[key].t === 'n') { // if it's a number
                worksheet[key].t = 's'; // change type to string
                worksheet[key].v = String(worksheet[key].v); // ensure value is a string
            } else if (worksheet[key].v) { // ensure any other type is also converted
                 worksheet[key].t = 's';
                 worksheet[key].v = String(worksheet[key].v);
            }
        }
    }
};


export async function validateWithSped(processedData: DataFrames, spedFileContent: string) {
    try {
        const normalizedContent = spedFileContent.replace(/\r\n/g, '\n');
        const lines = normalizedContent.split('\n');

        let spedInfo: SpedInfo | null = null;
        if (lines.length > 0 && lines[0]) {
            spedInfo = parseSpedInfo(lines[0].trim());
        }
        
        const participants = parseAllParticipants(normalizedContent);
        const allSpedKeyInfo = new Map<string, Partial<KeyInfo>>();
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            const parsedData = parseSpedLineForData(trimmedLine, participants);
            
            if (parsedData && parsedData.key) {
                const key = normalizeKey(parsedData.key);
                if (key.length === 44 && !allSpedKeyInfo.has(key)) {
                    allSpedKeyInfo.set(key, parsedData);
                }
            }
        }
        
        const allSpedKeys: KeyInfo[] = Array.from(allSpedKeyInfo.entries()).map(([key, data]) => ({
            key,
            origin: 'sped',
            ...data
        } as KeyInfo));
        
        const spedKeys = allSpedKeys.map(k => k.key);

        const validSheetNotes = processedData["Chaves Válidas"] || [];
        const validSheetMap = new Map((processedData["Notas Válidas"] || []).map(note => [
            normalizeKey(note['Chave de acesso']), 
            note
        ]));

        const spreadsheetKeysArray = validSheetNotes
            .map(row => normalizeKey(row['Chave de acesso']))
            .filter(key => key);
        const spreadsheetKeys = new Set(spreadsheetKeysArray);
        
        const canceledXmlKeys = new Set((processedData['Notas Canceladas'] || []).map(r => normalizeKey(r['Chave de acesso'])));
        
        const keysNotFoundInTxt = [...spreadsheetKeys]
            .filter(key => !spedKeys.includes(key))
            .map(key => {
                const note = validSheetMap.get(key);
                const isCte = note && ( (note.docType && note.docType === 'CTe') || (note.uploadSource && note.uploadSource.includes('CTe')) || (normalizeKey(note['Chave de acesso']).substring(20, 22) === '57'));
                const isSaida = note && spedInfo && note['Emitente CPF/CNPJ'] === spedInfo.cnpj;
                return {
                    key: key,
                    origin: 'planilha' as 'planilha',
                    partnerName: note?.['Fornecedor/Cliente'] || '',
                    emissionDate: note?.['Data de Emissão'] || '',
                    value: note?.['Valor'] || 0,
                    docType: isCte ? 'CTe' : 'NFe',
                    direction: isSaida ? 'Saída' : 'Entrada'
                }
            });

        const keysInTxtNotInSheet = spedKeys
            .filter(key => !spreadsheetKeys.has(key) && !canceledXmlKeys.has(key))
            .map(key => {
                const spedData = allSpedKeyInfo.get(key);
                return {
                    key: key,
                    origin: 'sped' as 'sped',
                    partnerName: spedData?.partnerName || 'N/A',
                    emissionDate: spedData?.emissionDate || 'N/A',
                    value: spedData?.value || 0,
                    comment: spedData?.comment || '',
                    docType: spedData?.docType || 'N/A',
                    direction: spedData?.direction || 'N/A'
                }
            });
        
        const keysFoundInBoth = [...spreadsheetKeys]
            .filter(key => spedKeys.includes(key))
            .map(key => {
                const note = validSheetMap.get(key);
                const isCte = note && ( (note.docType && note.docType === 'CTe') || (note.uploadSource && note.uploadSource.includes('CTe')) || (normalizeKey(note['Chave de acesso']).substring(20, 22) === '57'));
                const isSaida = note && spedInfo && note['Emitente CPF/CNPJ'] === spedInfo.cnpj;
                return {
                    key: key,
                    origin: 'planilha' as 'planilha', // Found in both, but origin is sheet for data purposes
                    partnerName: note?.['Fornecedor/Cliente'] || '',
                    emissionDate: note?.['Data de Emissão'] || '',
                    value: note?.['Valor'] || 0,
                    docType: isCte ? 'CTe' : 'NFe',
                    direction: isSaida ? 'Saída' : 'Entrada'
                }
            });

        const duplicateKeysInSheet = findDuplicates(spreadsheetKeysArray);
        const duplicateKeysInTxt = findDuplicates(spedKeys);

        const keyCheckResults: KeyCheckResult = { 
            allSpedKeys: allSpedKeys || [],
            keysFoundInBoth: keysFoundInBoth || [],
            keysNotFoundInTxt: keysNotFoundInTxt || [],
            keysInTxtNotInSheet: keysInTxtNotInSheet || [],
            duplicateKeysInSheet: duplicateKeysInSheet || [],
            duplicateKeysInTxt: duplicateKeysInTxt || [],
        };
        
        if (spedInfo && spedInfo.cnpj) {
            const docRef = doc(db, "verifications", spedInfo.cnpj);
            
            const verificationData = {
                cnpj: spedInfo.cnpj,
                companyName: spedInfo.companyName,
                competence: spedInfo.competence,
                keyCheckResults: keyCheckResults, 
                verifiedAt: serverTimestamp(),
            };

            await setDoc(docRef, verificationData, { merge: true });
        }

        return { keyCheckResults, spedInfo };
    } catch (error: any) {
        console.error('Error during SPED validation:', error);
        return { error: error.message || 'An unexpected error occurred during SPED validation.' };
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
        const keysNotFound = data.keyCheckResults?.keysNotFoundInTxt || [];
        const keysOnlySped = data.keyCheckResults?.keysInTxtNotInSheet || [];

        let keyFound = false;
        const updateKeyArray = (arr: KeyInfo[]) => {
            const idx = arr.findIndex(k => normalizeKey(k.key) === normalizeKey(key));
            if (idx !== -1) {
                arr[idx].comment = comment;
                keyFound = true;
            }
            return arr;
        };
        
        const updatedKeysNotFound = updateKeyArray([...keysNotFound]);
        const updatedKeysOnlySped = updateKeyArray([...keysOnlySped]);

        if (!keyFound) {
             return { error: "Chave não encontrada no histórico de verificação." };
        }
        
        await updateDoc(verificationRef, {
            "keyCheckResults.keysNotFoundInTxt": updatedKeysNotFound,
            "keyCheckResults.keysInTxtNotInSheet": updatedKeysOnlySped,
        });
        
        return { success: true, message: "Comentário salvo com sucesso!" };

    } catch (error: any) {
        console.error("Erro ao salvar comentário:", error);
        return { error: error.message || "Ocorreu um erro ao salvar o comentário." };
    }
}

export async function mergeExcelFiles(files: { name: string, content: string }[]) {
    try {
        const mergedWorkbook = XLSX.utils.book_new();
        const sheetsData: { [sheetName: string]: any[][] } = {};

        for (const file of files) {
            const buffer = Buffer.from(file.content, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            
            // Standardize to ODS in memory before processing
            const odsOutput = XLSX.write(workbook, { bookType: 'ods', type: 'buffer' });
            const standardizedWorkbook = XLSX.read(odsOutput, { type: 'buffer' });

            for (const sheetName of standardizedWorkbook.SheetNames) {
                const worksheet = standardizedWorkbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

                if (!sheetsData[sheetName]) {
                    sheetsData[sheetName] = [];
                }

                if (sheetsData[sheetName].length === 0) {
                     sheetsData[sheetName].push(...jsonData);
                } else {
                     sheetsData[sheetName].push(...jsonData.slice(1));
                }
            }
        }

        if (Object.keys(sheetsData).length === 0) {
            return { error: "Nenhuma planilha encontrada nos arquivos carregados." };
        }

        for (const sheetName in sheetsData) {
            const newWorksheet = XLSX.utils.aoa_to_sheet(sheetsData[sheetName]);
            XLSX.utils.book_append_sheet(mergedWorkbook, newWorksheet, sheetName);
        }

        if (mergedWorkbook.SheetNames.length === 0) {
            return { error: "Nenhum dado válido encontrado para agrupar." };
        }
        
        const buffer = XLSX.write(mergedWorkbook, { bookType: 'ods', type: 'array' });
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        
        return { base64Data: base64 };

    } catch (error: any) {
        console.error("Erro ao agrupar planilhas:", error);
        return { error: error.message || "Ocorreu um erro ao agrupar as planilhas." };
    }
}


export async function joinExcelSheets(file: { name: string, content: string }) {
    try {
        const buffer = Buffer.from(file.content, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        
        const allData: any[] = [];
        const allHeaders = new Set<string>();

        // First pass: collect all headers
        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (jsonData.length > 0) {
                const headers = jsonData[0] as string[];
                headers.forEach(header => allHeaders.add(header));
            }
        }
        
        const orderedHeaders = Array.from(allHeaders);

        // Second pass: process and collect data
        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
            allData.push(...jsonData);
        }
        
        const finalSheet = XLSX.utils.json_to_sheet(allData, { header: orderedHeaders });
        const finalWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(finalWorkbook, finalSheet, "Abas Consolidadas");

        const outputBuffer = XLSX.write(finalWorkbook, { bookType: 'ods', type: 'array' });
        
        let binary = '';
        const bytes = new Uint8Array(outputBuffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        
        return { base64Data: base64 };

    } catch (error: any) {
        console.error("Erro ao juntar abas da planilha:", error);
        return { error: error.message || "Ocorreu um erro ao processar o arquivo." };
    }
}

export async function unifyZipFiles(files: { name: string, content: string }[]) {
    try {
        const finalZip = new JSZip();

        for (const file of files) {
            const zip = await JSZip.loadAsync(file.content, { base64: true });
            
            const filePromises = Object.keys(zip.files).map(async (filename) => {
                const zipEntry = zip.files[filename];
                if (!zipEntry.dir) {
                    const fileData = await zipEntry.async('nodebuffer');
                    // This is a browser-safe way to get the basename
                    const baseName = filename.substring(filename.lastIndexOf('/') + 1);
                    finalZip.file(baseName, fileData);
                }
            });
            await Promise.all(filePromises);
        }

        const base64 = await finalZip.generateAsync({ type: "base64" });

        return { base64Data: base64 };

    } catch (error: any) {
        console.error("Erro ao unificar arquivos ZIP:", error);
        return { error: error.message || "Ocorreu um erro ao unificar os arquivos." };
    }
}

// --- Logic for 'Extrair NF-e' Tool ---

const flattenObject = (obj: any, parentKey = '', res: { [key: string]: any } = {}) => {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const propName = parentKey ? `${parentKey}/${key}` : key;
            // Exclude 'det' from this level of flattening, it will be handled separately
            if (key === 'det') {
                continue;
            }
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                flattenObject(obj[key], propName, res);
            } else if (Array.isArray(obj[key])) {
                 res[propName] = obj[key].map((item: any) => typeof item === 'object' ? JSON.stringify(item) : item).join('; ');
            }
            else {
                res[propName] = obj[key];
            }
        }
    }
    return res;
}

function getValueByPath(obj: any, path: string | string[]): any {
    if (!Array.isArray(path)) {
        path = path.split('/');
    }
    let current = obj;
    for (const key of path) {
        if (current && typeof current === 'object' && key in current) {
            current = current[key];
        } else {
            return 'N/A';
        }
    }
    return current !== undefined && current !== null ? String(current) : 'N/A';
}

export async function extractNfeData(files: { name: string, content: string }[]) {
     const SPECIFIC_TAGS_MAP: { [key: string]: string[] } = {
        "Número NF-e": ["nfeProc", "NFe", "infNFe", "ide", "nNF"],
        "Chave NF-e": ["nfeProc", "protNFe", "infProt", "chNFe"],
        "Valor Total Nota": ["nfeProc", "NFe", "infNFe", "total", "ICMSTot", "vNF"],
        "Valor ICMS": ["nfeProc", "NFe", "infNFe", "total", "ICMSTot", "vICMS"],
        "Valor Total IPI": ["nfeProc", "NFe", "infNFe", "total", "ICMSTot", "vIPI"],
        "Valor Total PIS": ["nfeProc", "NFe", "infNFe", "total", "ICMSTot", "vPIS"],
        "Valor Total COFINS": ["nfeProc", "NFe", "infNFe", "total", "ICMSTot", "vCOFINS"],
        "Valor Total Tributos": ["nfeProc", "NFe", "infNFe", "total", "ICMSTot", "vTotTrib"],
        "Data de Emissão": ["nfeProc", "NFe", "infNFe", "ide", "dhEmi"]
    };

    const COLUMNS_TO_FORMAT_DECIMAL = [
        "Valor Total Nota",
        "Valor ICMS",
        "Valor Total IPI",
        "Valor Total PIS",
        "Valor Total COFINS",
        "Valor Total Tributos"
    ];

     try {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            isArray: (name, jpath, isLeafNode, isAttribute) => { 
                if (name === "det" || name === "dup" || name === "obsCont") return true;
                return false;
             }
        });

        const dadosCompletos: any[] = [];
        const dadosEspecificos: any[] = [];
        const dadosItens: any[] = [];


        for (const file of files) {
            try {
                const jsonObj = parser.parse(file.content);
                const nfeProc = jsonObj.nfeProc;
                const chaveNFe = getValueByPath(jsonObj, SPECIFIC_TAGS_MAP["Chave NF-e"]) || file.name;

                // --- DADOS COMPLETOS ---
                const flatData = flattenObject(jsonObj);
                flatData['Arquivo'] = file.name;
                flatData['Chave NF-e'] = chaveNFe;
                dadosCompletos.push(flatData);
                
                // --- DADOS ESPECIFICOS ---
                const specificData: { [key: string]: string } = { 'Arquivo': file.name };
                for (const colName in SPECIFIC_TAGS_MAP) {
                    let value = getValueByPath(jsonObj, SPECIFIC_TAGS_MAP[colName]);
                    if (COLUMNS_TO_FORMAT_DECIMAL.includes(colName) && value && value !== 'N/A') {
                        value = parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    }
                    specificData[colName] = value;
                }
                dadosEspecificos.push(specificData);
                
                // --- DADOS DOS ITENS ---
                const items = nfeProc?.NFe?.infNFe?.det;
                if (items && Array.isArray(items)) {
                    items.forEach((item: any, index: number) => {
                        const flatItem = flattenObject(item);
                        flatItem['Arquivo'] = file.name;
                        flatItem['Chave NF-e'] = chaveNFe;
                        flatItem['Número do Item'] = index + 1;
                        dadosItens.push(flatItem);
                    });
                }


            } catch (e: any) {
                 console.error(`Error processing file ${file.name}:`, e);
                 // Add placeholder for corrupted file to maintain row alignment
                 const chaveNFeErro = `ERRO-${file.name}`;
                 dadosCompletos.push({ 'Arquivo': file.name, 'Chave NF-e': chaveNFeErro, 'Erro_Processamento': `Erro de Sintaxe XML: ${e.message}` });
                 const errorRow: { [key: string]: string } = { 'Arquivo': file.name, 'Chave NF-e': chaveNFeErro };
                 Object.keys(SPECIFIC_TAGS_MAP).forEach(key => errorRow[key] = 'ERRO XML');
                 dadosEspecificos.push(errorRow);
            }
        }

        const wb = XLSX.utils.book_new();

        // Aba 'Dados NF-e'
        if (dadosEspecificos.length > 0) {
            const finalCols = ['Arquivo', ...Object.keys(SPECIFIC_TAGS_MAP)];
            const reorderedDadosEspecificos = dadosEspecificos.map(row => {
                const newRow: {[key: string]: any} = {};
                finalCols.forEach(col => newRow[col] = row[col] || 'N/A');
                return newRow;
            })
            const wsEspecificos = XLSX.utils.json_to_sheet(reorderedDadosEspecificos, { header: finalCols });
            forceCellAsString(wsEspecificos, "Chave NF-e");
            XLSX.utils.book_append_sheet(wb, wsEspecificos, 'Dados NF-e');
        }
        
        // Aba 'Dados Itens'
        if (dadosItens.length > 0) {
            const wsItens = XLSX.utils.json_to_sheet(dadosItens);
            forceCellAsString(wsItens, "Chave NF-e");
            XLSX.utils.book_append_sheet(wb, wsItens, 'Dados Itens');
        }
        
        // Aba 'Dados Completos XML'
        if (dadosCompletos.length > 0) {
            const wsCompletos = XLSX.utils.json_to_sheet(dadosCompletos);
            forceCellAsString(wsCompletos, "Chave NF-e");
            XLSX.utils.book_append_sheet(wb, wsCompletos, 'Dados Completos XML');
        }


        const buffer = XLSX.write(wb, { bookType: 'ods', type: 'array' });

        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        return { base64Data: base64 };

    } catch (error: any) {
        console.error("Erro ao extrair dados de NF-e:", error);
        return { error: error.message || "Ocorreu um erro ao extrair os dados." };
    }
}


export async function extractCteData(files: { name: string, content: string }[]) {
     const TOMADOR_MAP: { [key: string]: string } = {
        '0': 'Remetente',
        '1': 'Expedidor',
        '2': 'Recebedor',
        '3': 'Destinatário',
        '4': 'Outros (Substituto/Terceiro)'
    };
    
    const SPECIFIC_TAGS_MAP: { [key: string]: string } = {
        "Número CT-e": "cteProc/CTe/infCte/ide/nCT",
        "Chave CT-e": "cteProc/protCTe/infProt/chCTe",
        "Código do Tomador": "cteProc/CTe/infCte/ide/toma3/toma,cteProc/CTe/infCte/ide/toma4/toma,cteProc/CTe/infCte/ide/toma",
        "Nome do Remetente": "cteProc/CTe/infCte/rem/xNome",
        "CNPJ do Remetente": "cteProc/CTe/infCte/rem/CNPJ",
        "Nome do Destinatário": "cteProc/CTe/infCte/dest/xNome",
        "CNPJ do Destinatário": "cteProc/CTe/infCte/dest/CNPJ",
        "Chave NF-e": "cteProc/CTe/infCte/infCTeNorm/infDoc/infNFe/chave",
        "Valor Total Prestação": "cteProc/CTe/infCte/vPrest/vTPrest",
        "Valor ICMS": "cteProc/CTe/infCte/imp/ICMS/ICMS00/vICMS",
        "Valor ICMS ST Retido (ICMS00)": "cteProc/CTe/infCte/imp/ICMS/ICMS00/vICMSSTRet",
        "Valor ICMS ST Retido (ICMS60)": "cteProc/CTe/infCte/imp/ICMS/ICMS60/vICMSSTRet",
        "Valor Total Tributos": "cteProc/CTe/infCte/imp/vTotTrib",
        "Valor ICMS Outra UF": "cteProc/CTe/infCte/imp/ICMS/ICMSOutraUF/vICMSOutraUF"
    };

    const COLUMNS_TO_FORMAT_DECIMAL = [
        "Valor Total Prestação", "Valor ICMS", "Valor ICMS ST Retido (ICMS00)",
        "Valor ICMS ST Retido (ICMS60)", "Valor Total Tributos", "Valor ICMS Outra UF"
    ];

    try {
        const parser = new XMLParser({ 
            ignoreAttributes: false, 
            attributeNamePrefix: "@_", 
            isArray: (name) => name === "infNFe" 
        });
        
        const dadosCompletos: any[] = [];
        const dadosEspecificos: any[] = [];

        for (const file of files) {
            try {
                const jsonObj = parser.parse(file.content);
                
                const flatData = flattenObject(jsonObj);
                flatData['Arquivo'] = file.name;
                dadosCompletos.push(flatData);

                const specificData: { [key: string]: any } = { 'Arquivo': file.name };
                for (const colName in SPECIFIC_TAGS_MAP) {
                    if (colName === "Chave NF-e") continue;

                    const paths = SPECIFIC_TAGS_MAP[colName].split(',');
                    let value: any = 'N/A';
                    for (const path of paths) {
                        const foundValue = getValueByPath(jsonObj, path.trim());
                        if (foundValue !== 'N/A') {
                            value = foundValue;
                            break;
                        }
                    }

                    if (COLUMNS_TO_FORMAT_DECIMAL.includes(colName) && value && value !== 'N/A' && typeof value === 'string') {
                         value = parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    }
                    specificData[colName] = value;
                }

                // Correctly extract referenced NF-e keys
                let chavesNfe = 'N/A';
                const infNFe_array = getValueByPath(jsonObj, "cteProc/CTe/infCte/infCTeNorm/infDoc/infNFe");

                if (infNFe_array && infNFe_array !== 'N/A') {
                    const keys = Array.isArray(infNFe_array) 
                        ? infNFe_array.map((nfe: any) => nfe.chave) 
                        : [infNFe_array.chave];
                    chavesNfe = keys.filter(Boolean).join(', ');
                }
                specificData["Chave NF-e"] = chavesNfe || 'N/A';
                
                const codigoTomador = specificData["Código do Tomador"];
                specificData["Tomador do Serviço"] = TOMADOR_MAP[codigoTomador] || 'Não Informado/Erro';

                dadosEspecificos.push(specificData);

            } catch (e: any) {
                 console.error(`Error processing file ${file.name}:`, e);
                 dadosCompletos.push({ 'Arquivo': file.name, 'Erro_Processamento': `Erro de Sintaxe XML: ${e.message}` });
                 const errorRow: { [key: string]: string } = { 'Arquivo': file.name };
                 Object.keys(SPECIFIC_TAGS_MAP).forEach(key => errorRow[key] = 'ERRO XML');
                 dadosEspecificos.push(errorRow);
            }
        }
        
        const wb = XLSX.utils.book_new();

        if (dadosCompletos.length > 0) {
            const wsCompletos = XLSX.utils.json_to_sheet(dadosCompletos);
            forceCellAsString(wsCompletos, "cteProc/protCTe/infProt/chCTe");
            forceCellAsString(wsCompletos, "cteProc/CTe/infCte/infCTeNorm/infDoc/infNFe/chave");
            XLSX.utils.book_append_sheet(wb, wsCompletos, 'Dados Completos');
        }
        
        if (dadosEspecificos.length > 0) {
            const finalColsOrder = ['Arquivo', ...Object.keys(SPECIFIC_TAGS_MAP).filter(c => c !== "Código do Tomador"), "Tomador do Serviço"];
             const wsEspecificos = XLSX.utils.json_to_sheet(dadosEspecificos.map(row => {
                const newRow: {[key: string]: any} = {};
                finalColsOrder.forEach(col => newRow[col] = row[col] || 'N/A');
                return newRow;
            }), { header: finalColsOrder });
            forceCellAsString(wsEspecificos, "Chave CT-e");
            forceCellAsString(wsEspecificos, "Chave NF-e");
            XLSX.utils.book_append_sheet(wb, wsEspecificos, 'Dados Específicos');
        }

        const buffer = XLSX.write(wb, { bookType: 'ods', type: 'array' });

        let binary = '';
        const bytes = new Uint8Array(outputBuffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        return { base64Data: base64 };

    } catch (error: any) {
        console.error("Erro ao extrair dados de CT-e:", error);
        return { error: error.message || "Ocorreu um erro ao extrair os dados." };
    }
}

export async function extractReturnData(files: { name: string; content: string }[]) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '_text',
    isArray: (name, jpath) => {
      return jpath === 'nfeProc.NFe.infNFe.det';
    },
  });

  const dados_por_item: any[] = [];

  for (const file of files) {
    try {
      const jsonObj = parser.parse(file.content);
      const nfeProc = jsonObj.nfeProc;
      const infNFe = nfeProc?.NFe?.infNFe;
      if (!infNFe) continue;

      const dados_nf_base: any = { Arquivo: file.name };
      
      dados_nf_base['nNF'] = infNFe.ide?.nNF;
      dados_nf_base['emit_xNome'] = infNFe.emit?.xNome;
      dados_nf_base['chNFe'] = nfeProc.protNFe?.infProt?.chNFe;
      
      const icmsTot = infNFe.total?.ICMSTot;
      dados_nf_base['vNF'] = icmsTot?.vNF;
      dados_nf_base['vICMS'] = icmsTot?.vICMS;
      dados_nf_base['vST'] = icmsTot?.vST;
      dados_nf_base['vIPI'] = icmsTot?.vIPI;
      dados_nf_base['vPISNF'] = icmsTot?.vPIS;
      dados_nf_base['vCOFINSNF'] = icmsTot?.vCOFINS;
      dados_nf_base['vOutro'] = icmsTot?.vOutro;
      
      let chaves_ref: string[] = [];
      if (infNFe.ide?.NFref) {
        if(Array.isArray(infNFe.ide.NFref)) {
            chaves_ref = infNFe.ide.NFref.map((ref: any) => ref.refNFe).filter(Boolean);
        } else if (infNFe.ide.NFref.refNFe) {
            chaves_ref.push(infNFe.ide.NFref.refNFe);
        }
      }
      dados_nf_base['refNFe'] = chaves_ref.join('; ');

      const detalhes = infNFe.det;
      if (detalhes) {
        for (const item of detalhes) {
          const dados_item = { ...dados_nf_base };
          const prod = item.prod;
          const imposto = item.imposto;

          dados_item['xProd'] = prod?.xProd;
          dados_item['CFOP'] = prod?.CFOP;
          dados_item['qCom'] = prod?.qCom;
          dados_item['vUnCom'] = prod?.vUnCom;
          dados_item['vProdItem'] = prod?.vProd;
          
          dados_item['vICMSItem'] = imposto?.ICMS ? (Object.values(imposto.ICMS)[0] as any)?.vICMS : null;
          dados_item['vSTItem'] = imposto?.ICMSST?.vICMSST;
          dados_item['vPISItem'] = imposto?.PIS?.PISOutr?.vPIS;
          dados_item['vCOFINSItem'] = imposto?.COFINS?.COFINSOutr?.vCOFINS;
          dados_item['vIPIItem'] = imposto?.IPI ? (Object.values(imposto.IPI)[0] as any)?.vIPI : null;
          dados_item['vIPIDevol'] = imposto?.impostoDevol?.IPI?.vIPIDevol;

          dados_por_item.push(dados_item);
        }
      }
    } catch (e: any) {
      console.error(`Error processing file ${file.name}:`, e);
      // Optional: Add error information to the output if needed
    }
  }

  // Formatting and creating Excel
  const df = dados_por_item.map(row => ({
    ...row,
    nNF: parseInt(row.nNF) || 0,
    vNF: parseFloat(String(row.vNF).replace(',', '.')) || 0,
    vICMS: parseFloat(String(row.vICMS).replace(',', '.')) || 0,
    vST: parseFloat(String(row.vST).replace(',', '.')) || 0,
    vIPI: parseFloat(String(row.vIPI).replace(',', '.')) || 0,
    vPISNF: parseFloat(String(row.vPISNF).replace(',', '.')) || 0,
    vCOFINSNF: parseFloat(String(row.vCOFINSNF).replace(',', '.')) || 0,
    vOutro: parseFloat(String(row.vOutro).replace(',', '.')) || 0,
    qCom: parseFloat(String(row.qCom).replace(',', '.')) || 0,
    vUnCom: parseFloat(String(row.vUnCom).replace(',', '.')) || 0,
    vProdItem: parseFloat(String(row.vProdItem).replace(',', '.')) || 0,
    vICMSItem: parseFloat(String(row.vICMSItem).replace(',', '.')) || 0,
    vSTItem: parseFloat(String(row.vSTItem).replace(',', '.')) || 0,
    vPISItem: parseFloat(String(row.vPISItem).replace(',', '.')) || 0,
    vCOFINSItem: parseFloat(String(row.vCOFINSItem).replace(',', '.')) || 0,
    vIPIItem: parseFloat(String(row.vIPIItem).replace(',', '.')) || 0,
    vIPIDevol: parseFloat(String(row.vIPIDevol).replace(',', '.')) || 0,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(df);

  // Force chNFe and refNFe columns to be text
  forceCellAsString(ws, 'chNFe');
  forceCellAsString(ws, 'refNFe');


  XLSX.utils.book_append_sheet(wb, ws, 'Dados');

  const buffer = XLSX.write(wb, { bookType: 'ods', type: 'array' });
  const base64 = Buffer.from(buffer).toString('base64');
  
  return { base64Data: base64 };
}

// --- Logic for 'Alterar XML' Tool ---

// Helper function to recursively get all paths from a JSON object
const getPaths = (obj: any, parentPath = ''): string[] => {
    let paths: string[] = [];
    if (obj === null || typeof obj !== 'object') {
        return paths;
    }

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const newPath = parentKey ? `${parentKey}/${key}` : key;
            paths.push(newPath);
            if (typeof obj[key] === 'object') {
                paths = paths.concat(getPaths(obj[key], newPath));
            }
        }
    }
    return paths;
};

export async function getXmlPaths(file: { name: string; content: string }) {
    try {
        const parser = new XMLParser({ 
            ignoreAttributes: false, 
            attributeNamePrefix: "@_",
            preserveOrder: true
        });
        const jsonObj = parser.parse(file.content);
        const paths = Array.from(new Set(getPaths(jsonObj))).sort();
        return { paths };
    } catch (error: any) {
        console.error("Erro ao analisar XML para obter caminhos:", error);
        return { error: `Não foi possível analisar o arquivo ${file.name}. É um XML válido?` };
    }
}


const setValueByPath = (obj: any, path: string, newValue: any) => {
    const keys = path.split('/');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
        if (current === undefined) return; 
    }
    current[keys[keys.length - 1]] = newValue;
};

export async function processXmls(data: { files: { name: string, content: string }[], selectedPath: string, newText: string, docType: 'NFE' | 'CTE'}) {
    const { files, selectedPath, newText, docType } = data;
    try {
        const zip = new JSZip();
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            preserveOrder: true
        });
        const builder = new XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            format: true,
            preserveOrder: true
        });

        for (const file of files) {
            let jsonObj = parser.parse(file.content);
            setValueByPath(jsonObj, selectedPath, newText);
            const xmlContent = builder.build(jsonObj);
            zip.file(file.name, xmlContent);
        }

        const base64 = await zip.generateAsync({ type: "base64" });
        return { base64Data: base64 };

    } catch (error: any) {
        console.error("Erro ao processar arquivos XML:", error);
        return { error: error.message || "Ocorreu um erro ao modificar os arquivos XML." };
    }
}

export async function separateXmlFromExcel(data: { excelFile: string, zipFile: string }) {
    try {
        const { excelFile, zipFile } = data;

        // 1. Read keys from Excel
        const excelWorkbook = XLSX.read(excelFile, { type: 'base64' });
        const firstSheetName = excelWorkbook.SheetNames[0];
        const worksheet = excelWorkbook.Sheets[firstSheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const targetKeys = new Set(jsonData.map(row => String(row[0]).trim()).filter(Boolean));

        // 2. Process ZIP file
        const zip = await JSZip.loadAsync(zipFile, { base64: true });
        const outputZip = new JSZip();
        const foundKeys: string[] = [];
        const parser = new XMLParser({ ignoreAttributes: true });

        const xmlFiles = Object.keys(zip.files).filter(name => name.toLowerCase().endsWith('.xml'));

        for (const filename of xmlFiles) {
            if (zip.files[filename].dir) continue;
            
            try {
                const xmlContent = await zip.files[filename].async('string');
                const jsonObj = parser.parse(xmlContent);

                // Check if it's an event XML (procEventoNFe)
                if (jsonObj.procEventoNFe) {
                    continue; // Ignore event files
                }
                
                let accessKey = '';
                if(jsonObj.nfeProc?.protNFe?.infProt?.chNFe) {
                    accessKey = jsonObj.nfeProc.protNFe.infProt.chNFe;
                } else if (jsonObj.cteProc?.protCTe?.infProt?.chCTe) {
                     accessKey = jsonObj.cteProc.protCTe.infProt.chCTe;
                } else if(jsonObj.NFe?.infNFe?.['@_Id']) {
                    accessKey = jsonObj.NFe.infNFe['@_Id'].replace('NFe', '');
                }


                if (accessKey && targetKeys.has(accessKey)) {
                    outputZip.file(filename, xmlContent);
                    foundKeys.push(accessKey);
                }
            } catch (e) {
                console.warn(`Could not parse XML file ${filename}, skipping.`, e);
            }
        }
        
        // 3. Create result Excel
        const foundKeysWB = XLSX.utils.book_new();
        const foundKeysData = foundKeys.map(key => ({ "Chave de Acesso Encontrada": key }));
        const foundKeysWS = XLSX.utils.json_to_sheet(foundKeysData);
        forceCellAsString(foundKeysWS, "Chave de Acesso Encontrada");

        XLSX.utils.book_append_sheet(foundKeysWB, foundKeysWS, 'Chaves Encontradas');
        const foundKeysBase64 = XLSX.write(foundKeysWB, { bookType: 'ods', type: 'base64' });

        // 4. Create result ZIP
        const outputZipBase64 = await outputZip.generateAsync({ type: 'base64' });

        return {
            separatedZip: outputZipBase64,
            foundKeysExcel: foundKeysBase64,
        };

    } catch (error: any) {
        console.error("Erro ao separar arquivos XML:", error);
        return { error: error.message || "Ocorreu um erro ao separar os arquivos XML." };
    }
}
      
export async function downloadHistoryData(verificationId: string) {
    // This function is being removed as we are no longer storing the full processed data.
    return { error: "A funcionalidade de download do histórico foi descontinuada para resolver problemas de limite de tamanho do banco de dados." };
}

// --- Logic for 'Solver' Tool ---
export async function findSumCombinations(numbers: number[], target: number) {
    let result: number[] = [];
    
    // Sort numbers in descending order to potentially find a solution faster
    const sortedNumbers = [...numbers].sort((a, b) => b - a);

    function find(currentTarget: number, startIndex: number, combination: number[]): boolean {
        if (currentTarget === 0) {
            result = combination;
            return true;
        }

        if (currentTarget < 0 || startIndex >= sortedNumbers.length) {
            return false;
        }

        const currentNumber = sortedNumbers[startIndex];

        // Try including the current number
        if (find(currentTarget - currentNumber, startIndex + 1, [...combination, currentNumber])) {
            return true;
        }

        // Try excluding the current number
        if (find(currentTarget, startIndex + 1, combination)) {
            return true;
        }

        return false;
    }

    find(target, 0, []);
    
    if (result.length > 0) {
        return { combination: result };
    } else {
        return { error: "Nenhuma combinação exata foi encontrada." };
    }
}

// --- Logic for CFOP Comparison ---

const TAX_RELEVANT_COLUMNS: { [key: string]: { sheet: string[]; xml: string[] } } = {
    'Planilha ICMS': {
        sheet: ['CFOP', 'CST', 'Base', 'Alíquota', 'Valor', 'CFOP Replicado'],
        xml: ['ICMS CST', 'ICMS Base de Cálculo', 'ICMS Alíquota', 'ICMS Valor'],
    },
    'Planilha ICMS ST': {
        sheet: ['CFOP', 'CST', 'Base', 'Alíquota', 'Valor', 'CFOP Replicado'],
        xml: ['ICMS CST', 'ICMS vBCSTRet', 'ICMS pST', 'ICMS vICMSSTRet'],
    },
    'Planilha PIS': {
        sheet: ['CFOP', 'CST', 'Base', 'Alíquota', 'Valor', 'CFOP Replicado'],
        xml: ['PIS CST', 'PIS Base de Cálculo', 'PIS Alíquota', 'PIS Valor'],
    },
    'Planilha COFINS': {
        sheet: ['CFOP', 'CST', 'Base', 'Alíquota', 'Valor', 'CFOP Replicado'],
        xml: ['COFINS CST', 'COFINS Base de Cálculo', 'COFINS Alíquota', 'COFINS Valor'],
    },
    'Planilha IPI': {
        sheet: ['CFOP', 'CST', 'Base', 'Alíquota', 'Valor', 'CFOP Replicado'],
        xml: ['IPI CST', 'IPI Base de Cálculo', 'IPI Alíquota', 'IPI Valor'],
    },
};

const getCfopDescription = (cfop: string) => {
    if (!cfop) return 'N/A';
    const code = parseInt(cfop, 10);
    return cfopDescriptions[code] || 'Descrição não encontrada';
};

const transformRow = (item: any, type: 'xml' | 'sheet', taxCols: { sheet: string[], xml: string[] }) => {
    const base = {
        'Número da NF': item['Número da NF'],
        'NCM XML': type === 'xml' ? item['NCM'] : 'N/A',
        'Valor Total do Produto XML': type === 'xml' ? item['Valor Total do Produto'] : 'N/A',
        'Valor do Item Sage': type === 'sheet' ? item['Valor do Item'] : 'N/A',
    };

    const xmlData: { [key: string]: any } = {};
    if (type === 'xml') {
        const cfop = item['CFOP'];
        xmlData['CFOP XML'] = cfop;
        xmlData['CFOP XML Descrição'] = getCfopDescription(cfop);
        taxCols.xml.forEach(col => {
            xmlData[`${col} XML`] = item[col];
        });
    }

    const sheetData: { [key: string]: any } = {};
    if (type === 'sheet') {
        const cfop = item['CFOP'];
        sheetData['CFOP Sage'] = cfop;
        sheetData['CFOP Sage Descrição'] = getCfopDescription(cfop);
        taxCols.sheet.forEach(col => {
            sheetData[`${col} Sage`] = item[col];
        });
    }

    return { ...base, ...xmlData, ...sheetData };
};


export async function compareCfopData(data: { xmlItemsData: any[], taxSheetsData: { [key: string]: string } }): Promise<{ results: CfopComparisonResult, error?: string }> {
    const { xmlItemsData, taxSheetsData } = data;
    const finalResults: CfopComparisonResult = {};
    const newHeaders = [
        'Itens da Nota', 'Valor do Item', 'Desconto', 'Frete/Seg/Desp',
        'CFOP', 'CST', 'Base', 'Alíquota', 'Valor', 'Aux 1', 'Aux 2', 'CFOP Replicado'
    ];

    try {
        const createXmlComparisonKey = (item: any) => {
            const nf = item['Número da NF'];
            const value = item['Valor Total do Produto']; // Use the correct field name
            return `${nf}_${(Math.round(parseFloat(String(value).replace(',', '.')) * 100) / 100).toFixed(2)}`;
        };
        
        const createSheetComparisonKey = (row: any) => {
            const nf = row['Número da NF'];
            const value = row['Valor do Item']; // Use this field from the sheet now
            return `${nf}_${(Math.round(parseFloat(String(value).replace(',', '.')) * 100) / 100).toFixed(2)}`;
        };
        
        const xmlItemsMap = new Map(xmlItemsData.map(item => [createXmlComparisonKey(item), item]));

        for (const taxName in taxSheetsData) {
            const sheetData = taxSheetsData[taxName];
            if (!sheetData) continue;

            const relevantCols = TAX_RELEVANT_COLUMNS[taxName as keyof typeof TAX_RELEVANT_COLUMNS] || { sheet: [], xml: [] };

            const workbook = XLSX.read(sheetData, { type: 'binary' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const df: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

            let dataAsObjects = df.map(row => {
                const obj: { [key: string]: any } = {};
                newHeaders.forEach((header, index) => {
                    obj[header] = row[index];
                });
                return obj;
            });

            let lastNfNumber: any = null;
            dataAsObjects.forEach(row => {
                if (!row['Itens da Nota'] || String(row['Itens da Nota']).trim() === '') {
                    lastNfNumber = row['Desconto']; 
                }
                row['Número da NF'] = lastNfNumber;
            });

            let sheetItems = dataAsObjects.filter(row =>
                row['Itens da Nota'] &&
                String(row['Itens da Nota']).toUpperCase() !== 'ITENS DA NOTA' &&
                String(row['Itens da Nota']).toUpperCase() !== 'TOTAL'
            );

            const sheetItemsMap = new Map(sheetItems.map(item => [
                createSheetComparisonKey(item),
                item
            ]));
            
            const localXmlItemsMap = new Map(xmlItemsMap);
            
            const foundInBoth: any[] = [];
            const onlyInXml: any[] = [];
            
            localXmlItemsMap.forEach((xmlItem, key) => {
                if (sheetItemsMap.has(key)) {
                    const sheetItem = sheetItemsMap.get(key);
                    const transformedXml = transformRow(xmlItem, 'xml', relevantCols);
                    const transformedSheet = transformRow(sheetItem!, 'sheet', relevantCols);
                    foundInBoth.push({ ...transformedXml, ...transformedSheet });
                    sheetItemsMap.delete(key);
                } else {
                    onlyInXml.push(transformRow(xmlItem, 'xml', relevantCols));
                }
            });

            const onlyInSheet = Array.from(sheetItemsMap.values()).map(sheetItem => 
                transformRow(sheetItem, 'sheet', relevantCols)
            );
            
            finalResults[taxName] = { foundInBoth, onlyInXml, onlyInSheet };
        }
        
        return { results: finalResults };

    } catch (error: any) {
        console.error("Erro ao comparar dados de impostos:", error);
        return { 
            results: {},
            error: error.message || "Ocorreu um erro na comparação de impostos.",
        };
    }
}
      

    













