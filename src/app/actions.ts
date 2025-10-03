
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

const parseAllParticipants = (spedFileContent: string) => {
    const participants = new Map<string, string>();
    const lines = spedFileContent.split('\n');
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
    
    // Basic validation for a C100 line (NFe)
    if (parts.length > 9 && parts[1] === 'C100') {
        const key = parts[9];
        const value = parseFloat(parts[23] || '0');
        const emissionDate = parts[10]; // DDMMYYYY
        const partnerCode = parts[3]; // Emitente ou Destinatario (COD_PART)
        const partnerName = participants.get(partnerCode) || '';

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
    else if (parts.length > 10 && parts[1] === 'D100') {
        const key = parts[10];
        const value = parseFloat(parts[16] || '0'); // vTPrest
        const emissionDate = parts[10]; // DDMMYYYY
        const partnerCode = parts[3]; // Emitente do CTe (COD_PART)
        const partnerName = participants.get(partnerCode) || '';

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

        const participants = parseAllParticipants(spedFileContent);
        
        const lines = spedFileContent.split('\n');
        if (lines.length > 0 && lines[0]) {
            spedInfo = parseSpedInfo(lines[0].trim());
        }
        
        for (const line of lines) {
            const parsedData = parseSpedLineForData(line.trim(), participants);
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
                    const cleanKey = key.replace(/^NFe|^_|^CTe_/, '');
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
        const sheetsData: { [sheetName: string]: any[][] } = {};

        // Read all sheets from all files
        for (const file of files) {
            const workbook = XLSX.read(file.content, { type: 'buffer' });
            for (const sheetName of workbook.SheetNames) {
                const worksheet = workbook.Sheets[sheetName];
                // Using header: 1 to get an array of arrays
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

                if (!sheetsData[sheetName]) {
                    sheetsData[sheetName] = [];
                }
                sheetsData[sheetName].push(...jsonData);
            }
        }

        if (Object.keys(sheetsData).length === 0) {
            return { error: "Nenhuma planilha encontrada nos arquivos carregados." };
        }

        // Process merged data to remove duplicate headers
        for (const sheetName in sheetsData) {
            const allRows = sheetsData[sheetName];
            if (allRows.length > 0) {
                const header = allRows[0];
                const uniqueRows = [header];
                const seenRows = new Set([JSON.stringify(header)]);

                for (let i = 1; i < allRows.length; i++) {
                    const rowString = JSON.stringify(allRows[i]);
                    // If it's a header row, we only add it if it's the very first one
                    if(JSON.stringify(allRows[i]) === JSON.stringify(header)) {
                         continue;
                    }
                    if (!seenRows.has(rowString)) {
                        uniqueRows.push(allRows[i]);
                        seenRows.add(rowString);
                    }
                }
                
                // Keep only the first header
                const finalRows = [uniqueRows[0]];
                for (let i = 1; i < uniqueRows.length; i++) {
                    if (JSON.stringify(uniqueRows[i]) !== JSON.stringify(header)) {
                        finalRows.push(uniqueRows[i]);
                    }
                }

                const newWorksheet = XLSX.utils.aoa_to_sheet(finalRows);
                XLSX.utils.book_append_sheet(mergedWorkbook, newWorksheet, sheetName);
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
