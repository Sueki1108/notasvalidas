
// src/app/actions.ts
'use server';

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';

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
};


export type KeyCheckResult = {
    keysNotFoundInTxt: KeyInfo[];
    keysInTxtNotInSheet: KeyInfo[];
    duplicateKeysInSheet: string[];
    duplicateKeysInTxt: string[];
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

const parseSpedLineForData = (line: string): Partial<KeyInfo> | null => {
    const parts = line.split('|');
    
    // Basic validation for a C100 line (NFe)
    if (parts.length > 9 && parts[1] === 'C100') {
        const key = parts[9];
        const value = parseFloat(parts[23] || '0');
        const emissionDate = parts[10]; // DDMMYYYY
        // For NFe, partner is in field 14 or 18 (emit or dest)
        const partnerName = parts[14] || parts[18] || ''; 

        if (key && key.length === 44) {
            return {
                key,
                value,
                emissionDate: emissionDate ? `${emissionDate.substring(0,2)}/${emissionDate.substring(2,4)}/${emissionDate.substring(4,8)}` : '',
                partnerName
            };
        }
    }
    // Validation for a D100 line (CTe)
    else if (parts.length > 9 && parts[1] === 'D100') {
        const key = parts[9];
        const value = parseFloat(parts[16] || '0'); // vTPrest
        const emissionDate = parts[10]; // DDMMYYYY
        // For CTe, partner is usually the sender (remetente) or receiver (destinatario)
        const partnerName = parts[13] || parts[17] || ''; 

        if (key && key.length === 44) {
            return {
                key,
                value,
                emissionDate: emissionDate ? `${emissionDate.substring(0,2)}/${emissionDate.substring(2,4)}/${emissionDate.substring(4,8)}` : '',
                partnerName
            };
        }
    }
    return null;
}


export async function validateWithSped(processedData: DataFrames, spedFileContent: string, allNotesFromXmls: any[]) {
    try {
        let spedInfo: SpedInfo | null = null;
        const allSpedKeys = new Map<string, Partial<KeyInfo>>();
        const allNotesMap = new Map(allNotesFromXmls.map(note => [
            (note['Chave de acesso'] || '').replace(/^NFe|^CTe/, ''), 
            note
        ]));

        const lines = spedFileContent.split('\n');
        if (lines.length > 0 && lines[0]) {
            spedInfo = parseSpedInfo(lines[0].trim());
        }
        
        for (const line of lines) {
            const parsedData = parseSpedLineForData(line.trim());
            if (parsedData && parsedData.key) {
                 if (!allSpedKeys.has(parsedData.key)) {
                    allSpedKeys.set(parsedData.key, parsedData);
                }
            }
        }
        
        let keyCheckResults: KeyCheckResult | null = null;
        const keysInTxt = new Set(allSpedKeys.keys());
        
        if (processedData['Chaves Válidas']) {
            const spreadsheetKeysArray = processedData['Chaves Válidas'].map(row => {
                const key = String(row['Chave de acesso']).trim();
                return key.startsWith('NFe') ? key.substring(3) : (key.startsWith('CTe') ? key.substring(3) : key);
            }).filter(key => key);
            const spreadsheetKeys = new Set(spreadsheetKeysArray);

            const keysNotFoundInTxt = [...spreadsheetKeys]
                .filter(key => !keysInTxt.has(key))
                .map(key => {
                    const note = allNotesMap.get(key);
                    return {
                        key: key,
                        origin: 'planilha' as 'planilha',
                        partnerName: note?.['Fornecedor/Cliente'] || '',
                        emissionDate: note?.['Data de Emissão'] || '',
                        value: note?.['Valor'] || 0
                    }
                });

            const keysInTxtNotInSheet = [...keysInTxt]
                .filter(key => !spreadsheetKeys.has(key))
                .map(key => {
                    const spedData = allSpedKeys.get(key);
                    return {
                        key: key,
                        origin: 'sped' as 'sped',
                        partnerName: spedData?.partnerName || '',
                        emissionDate: spedData?.emissionDate || '',
                        value: spedData?.value || 0
                    }
                });
            
            const duplicateKeysInSheet = findDuplicates(spreadsheetKeysArray);
            const duplicateKeysInTxt = findDuplicates(Array.from(allSpedKeys.keys()));

            keyCheckResults = { 
                keysNotFoundInTxt, 
                keysInTxtNotInSheet,
                duplicateKeysInSheet,
                duplicateKeysInTxt,
            };
        }
        
        if (spedInfo && spedInfo.cnpj && keyCheckResults) {
            const keysFromSheet: KeyInfo[] = (processedData['Chaves Válidas']?.map(row => row['Chave de acesso']) || [])
                .map((key: string) => {
                    const cleanKey = key.replace(/^NFe|^CTe/, '');
                    const note = allNotesMap.get(cleanKey);
                    return {
                        key: cleanKey,
                        origin: 'planilha',
                        foundInSped: keysInTxt.has(cleanKey),
                        comment: '',
                        partnerName: note?.['Fornecedor/Cliente'] || '',
                        emissionDate: note?.['Data de Emissão'] || '',
                        value: note?.['Valor'] || 0
                    };
                });
            
            const keysOnlyInSped: KeyInfo[] = (keyCheckResults.keysInTxtNotInSheet).map((keyInfo: KeyInfo) => ({
                ...keyInfo,
                origin: 'sped',
                foundInSped: true,
                comment: ''
            }));

            const verificationKeys = [...keysFromSheet, ...keysOnlyInSped];

            const stats = {
                totalSheetKeys: keysFromSheet.length,
                totalSpedKeys: allSpedKeys.size,
                foundInBoth: keysFromSheet.filter(k => k.foundInSped).length,
                onlyInSheet: keysFromSheet.filter(k => !k.foundInSped).length,
                onlyInSped: keysOnlyInSped.length,
            };

            const verificationData = {
                ...spedInfo,
                keys: verificationKeys,
                stats: stats,
                verifiedAt: serverTimestamp(),
            };

            await setDoc(doc(db, "verifications", spedInfo.cnpj), verificationData, { merge: true });
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
        const keys = data.keys || [];

        const keyIndex = keys.findIndex((k: any) => k.key.replace(/^NFe|^CTe/, '') === key.replace(/^NFe|^CTe/, ''));

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

export async function mergeExcelFiles(files: { name: string, content: ArrayBuffer }[]) {
    try {
        const mergedWorkbook = XLSX.utils.book_new();
        const sheetsData: { [sheetName: string]: any[] } = {};

        for (const file of files) {
            const workbook = XLSX.read(file.content, { type: 'buffer' });
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
        
        // Convert ArrayBuffer to base64
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

    

    