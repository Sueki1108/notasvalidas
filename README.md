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

1.  Navigate to the project directory in your terminal.
2.  Install NPM packages:
    ```sh
    npm install
    ```
3.  Run the development server:
    ```sh
    npm run dev
    ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Publishing to GitHub

Follow these steps to publish your project to a new GitHub repository.

1.  **Initialize a Git repository:**
    In your project's root directory, run:
    ```sh
    git init -b main
    ```

2.  **Add all files to staging:**
    ```sh
    git add .
    ```

3.  **Create your first commit:**
    A commit is a snapshot of your code at a specific point in time.
    ```sh
    git commit -m "Initial commit"
    ```

4.  **Create a new repository on GitHub:**
    - Go to [GitHub.com](https://github.com) and log in.
    - Click the `+` icon in the top-right corner and select **"New repository"**.
    - Give your repository a name (e.g., `excel-workflow-automator`).
    - Make sure the repository is set to **Public** or **Private** as you prefer.
    - **Do not** initialize it with a README, .gitignore, or license, as your project already has these.
    - Click **"Create repository"**.

5.  **Link your local repository to GitHub:**
    On the new repository page, GitHub will show you a URL. Copy it and run the following command, replacing the URL with your own.
    ```sh
    git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git
    ```

6.  **Push your code to GitHub:**
    This command sends your committed files to the GitHub repository.
    ```sh
    git push -u origin main
    ```

Now, your project code is safely stored on GitHub!
