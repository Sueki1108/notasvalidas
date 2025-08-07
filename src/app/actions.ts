'use server';

import * as XLSX from 'xlsx';
import { processDataFrames } from '@/lib/excel-processor';
import * as fs from 'fs/promises';
import * as path from 'path';

// Type for the file data structure expected by the processor
type DataFrames = { [key: string]: any[] };

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


export async function processUploadedFiles(formData: FormData) {
  try {
    const dataFrames: DataFrames = {};
    const fileEntries = formData.getAll('files');

    // Process all file entries from formData
    for (const entry of fileEntries) {
        if (entry instanceof File) {
            const fieldName = entry.name; // The original field name is stored in the file name
            if (!dataFrames[fieldName]) {
                dataFrames[fieldName] = [];
            }
            const buffer = await entry.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            // Process all sheets in the workbook
            for (const sheetName of workbook.SheetNames) {
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet);
              dataFrames[fieldName].push(...jsonData);
            }
        }
    }

    const spedKeysJson = formData.get('spedKeys');
    const allKeysInTxt = spedKeysJson && typeof spedKeysJson === 'string' ? JSON.parse(spedKeysJson) : [];
    
    const processedData = processDataFrames(dataFrames);

    let keyCheckResults = null;
    if (allKeysInTxt.length > 0 && processedData['Chaves Válidas']) {
        const spreadsheetKeysArray = processedData['Chaves Válidas'].map(row => String(row['Chave de acesso']).trim()).filter(key => key);
        const spreadsheetKeys = new Set(spreadsheetKeysArray);
        
        const keysInTxt = new Set(allKeysInTxt);

        const keysNotFoundInTxt = [...spreadsheetKeys].filter(key => !keysInTxt.has(key));
        const keysInTxtNotInSheet = [...keysInTxt].filter(key => !spreadsheetKeys.has(key));
        
        const duplicateKeysInSheet = findDuplicates(spreadsheetKeysArray);
        const duplicateKeysInTxt = findDuplicates(allKeysInTxt);

        keyCheckResults = { 
            keysNotFoundInTxt, 
            keysInTxtNotInSheet,
            duplicateKeysInSheet,
            duplicateKeysInTxt,
        };
    }

    return { data: processedData, keyCheckResults };
  } catch (error: any) {
    console.error('Error processing files:', error);
    // Ensure we return a serializable error object
    return { error: error.message || 'An unexpected error occurred during file processing.' };
  }
}

// Helper function to recursively read file paths
async function getFilePaths(dir: string): Promise<string[]> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
        dirents.map(async (dirent) => {
            const res = path.resolve(dir, dirent.name);
            if (dirent.isDirectory()) {
                // Ignore node_modules, .next, and .git directories
                if (dirent.name === 'node_modules' || dirent.name === '.next' || dirent.name === '.git' || dirent.name === '.idx') {
                    return [];
                }
                return getFilePaths(res);
            }
            return res;
        })
    );
    return Array.prototype.concat(...files);
}

// Server action to get all project files as a single text block
export async function getProjectFilesAsText(): Promise<string> {
    const textFileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.md', '.yaml', '.mjs', ''];
    try {
        const projectRoot = process.cwd();
        const allFilePaths = await getFilePaths(projectRoot);
        
        let combinedText = `This is a consolidated text file containing all the source code for the Excel Workflow Automator project.\n\n`;
        combinedText += `Generated on: ${new Date().toISOString()}\n\n`;
        combinedText += "============================================================\n\n";

        for (const filePath of allFilePaths) {
            const relativePath = path.relative(projectRoot, filePath);
            
             // Skip non-text files, lock files, and specific config files
            if (path.basename(relativePath) === 'package-lock.json' || !textFileExtensions.includes(path.extname(relativePath))) {
                 continue;
            }

            try {
                const content = await fs.readFile(filePath, 'utf-8');
                combinedText += `// FILE: ${relativePath}\n`;
                combinedText += "// ----------------------------------------------------------\n";
                combinedText += content;
                combinedText += "\n\n// END OF FILE: " + relativePath + "\n";
                combinedText += "============================================================\n\n";
            } catch (readError) {
                // It's possible some files can't be read (e.g. weird permissions, binary files)
                console.warn(`Could not read file: ${relativePath}`, readError);
            }
        }

        return combinedText;
    } catch (error: any) {
        console.error('Error getting project files:', error);
        return `Error generating project text: ${error.message}`;
    }
}
