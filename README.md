# Excel Workflow Automator

This is a powerful web-based application built with Next.js, designed to automate and streamline common, repetitive tasks involving spreadsheets (Excel, ODS), XML files, and financial documents. It provides a suite of tools to help users process, validate, and analyze their data efficiently.

## Key Features

The application is divided into several specialized tools, accessible through a unified interface:

- **Fluxo de Conferência (Main Workflow)**: A multi-step process for validating XML invoices (NF-e, CT-e) against SPED fiscal files, including advanced analysis and accounting comparisons.
- **Agrupador de Planilhas**: Merges multiple spreadsheet files into a single file.
- **Juntar Abas**: Consolidates all sheets from a single spreadsheet into one sheet.
- **Solver**: Finds combinations of numbers from a list that sum up to a specific target value.
- **Unificar Pastas (ZIP)**: Merges the content of multiple ZIP archives into a single ZIP file.
- **Extrair Itens (NF-e)**: Extracts detailed data from NF-e XML files, including item-level information, into a spreadsheet.
- **Extrair CT-e**: Extracts key data from CT-e XML files into a spreadsheet.
- **Devoluções**: A tool to analyze return invoices by processing both the return XMLs and the referenced original invoices.
- **Alterar XML**: Performs batch updates on XML files by replacing the text content of a specified tag.
- **Separar XML**: Filters a ZIP file containing XMLs based on a list of access keys provided in a spreadsheet.
- **Histórico**: A persistent history of all SPED validations, allowing users to review past results.

## Tech Stack

- **Frontend**: [Next.js](https://nextjs.org/) with [React](https://reactjs.org/) (App Router)
- **UI**: [ShadCN UI](https://ui.shadcn.com/) components, styled with [Tailwind CSS](https://tailwindcss.com/)
- **Generative AI**: [Firebase Genkit](https://firebase.google.com/docs/genkit) for AI-powered insights.
- **Backend/Database**: [Firebase Firestore](https://firebase.google.com/docs/firestore) for storing validation history.
- **File Processing**: Libraries like `xlsx` for spreadsheets and `jszip` for ZIP files.

## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

- Node.js (v18 or newer recommended)
- npm or yarn

### Installation & Running

1.  Clone the repository:
    ```sh
    git clone <YOUR_REPOSITORY_URL>
    ```
2.  Navigate to the project directory:
    ```sh
    cd <PROJECT_DIRECTORY>
    ```
3.  Install NPM packages:
    ```sh
    npm install
    ```
4.  Run the development server:
    ```sh
    npm run dev
    ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
