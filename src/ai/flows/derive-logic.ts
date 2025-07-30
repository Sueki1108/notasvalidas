// src/ai/flows/derive-logic.ts
'use server';

/**
 * @fileOverview Automatically derives spreadsheet processing logic using GenAI.
 *
 * - deriveSpreadsheetLogic - A function that derives spreadsheet logic.
 * - DeriveSpreadsheetLogicInput - The input type for deriveSpreadsheetLogic.
 * - DeriveSpreadsheetLogicOutput - The output type for deriveSpreadsheetLogic.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DeriveSpreadsheetLogicInputSchema = z.object({
  spreadsheetData: z
    .string()
    .describe(
      'The spreadsheet data as a string, expected to be in CSV format.'
    ),
  instruction: z.string().optional().describe('Optional instructions from the user'),
});
export type DeriveSpreadsheetLogicInput = z.infer<
  typeof DeriveSpreadsheetLogicInputSchema
>;

const DeriveSpreadsheetLogicOutputSchema = z.object({
  logicDescription: z
    .string()
    .describe('The derived logic for processing the spreadsheet.'),
  code: z.string().describe('The code to execute the logic on the spreadsheet'),
});
export type DeriveSpreadsheetLogicOutput = z.infer<
  typeof DeriveSpreadsheetLogicOutputSchema
>;

export async function deriveSpreadsheetLogic(
  input: DeriveSpreadsheetLogicInput
): Promise<DeriveSpreadsheetLogicOutput> {
  return deriveSpreadsheetLogicFlow(input);
}

const prompt = ai.definePrompt({
  name: 'deriveSpreadsheetLogicPrompt',
  input: {schema: DeriveSpreadsheetLogicInputSchema},
  output: {schema: DeriveSpreadsheetLogicOutputSchema},
  prompt: `You are an AI expert in processing spreadsheets and deriving logic from data.

  Based on the following spreadsheet data and optional user instructions, you will analyze the data and derive the logic needed to process it.

  Spreadsheet Data:
  {{spreadsheetData}}

  User Instructions (if any):
  {{instruction}}

  Return a json object that contains the description of the logic and the code to execute the logic on the spreadsheet.
  Ensure that code is fully functional and includes all necessary operations.
  Make sure the code is easy to read and follow, with comments explaining each step.

  Desired output format:
  {
    logicDescription: string,
    code: string,
  }`,
});

const deriveSpreadsheetLogicFlow = ai.defineFlow(
  {
    name: 'deriveSpreadsheetLogicFlow',
    inputSchema: DeriveSpreadsheetLogicInputSchema,
    outputSchema: DeriveSpreadsheetLogicOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
