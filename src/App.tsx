import { useState, type ChangeEvent } from "react";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  Download,
  RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";

interface DataRow {
  [key: string]: any;
}

interface DataSummary {
  fileName: string;
  rowCount: number;
  columns: string[];
  sampleData: DataRow[];
  dataTypes: Record<string, string>;
}

interface ClaudeResponse {
  content?: Array<{
    type: string;
    text: string;
  }>;
}

export default function DataAnalysisReportGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [data, setData] = useState<DataRow[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regeneratePrompt, setRegeneratePrompt] = useState<string>("");

  const handleFileUpload = async (
    e: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFileName(uploadedFile.name);
    setFile(uploadedFile);
    console.log(file);
    setError(null);
    setReport(null);

    const fileExtension = uploadedFile.name.split(".").pop()?.toLowerCase();

    try {
      if (fileExtension === "csv") {
        const text = await uploadedFile.text();
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results: Papa.ParseResult<DataRow>) => {
            setHeaders(results.meta.fields || []);
            setData(results.data);
          },
          error: (error: Error) => {
            setError(`Error parsing CSV: ${error.message}`);
          },
        });
      } else if (["xlsx", "xls"].includes(fileExtension || "")) {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: DataRow[] = XLSX.utils.sheet_to_json(worksheet, {
          defval: null,
        });

        if (jsonData.length > 0) {
          setHeaders(Object.keys(jsonData[0]));
          setData(jsonData);
        }
      } else {
        setError("Please upload a CSV, XLS, or XLSX file");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Error reading file: ${errorMessage}`);
    }
  };

  const analyzeData = async (isRegenerate: boolean = false): Promise<void> => {
    if (!data || data.length === 0) {
      setError("No data to analyze");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const dataSummary: DataSummary = {
        fileName: fileName,
        rowCount: data.length,
        columns: headers,
        sampleData: data.slice(0, 5),
        dataTypes: analyzeDataTypes(data, headers),
      };

      const systemPrompt = `You are an expert data analyst. Analyze the provided dataset and generate a comprehensive report in markdown format.

The report should include:
1. Executive Summary
2. Dataset Overview (rows, columns, data types)
3. Key Findings and Insights
4. Trend Analysis
5. Relationships and Correlations
6. Data Quality Assessment
7. Visualizations descriptions (describe what charts would be useful)
8. Conclusions and Recommendations

Identify the report type needed (performance analysis, trend analysis, comparative analysis, etc.) based on the data structure.

Format the response as clean markdown suitable for PDF conversion.`;

      const userPrompt = isRegenerate
        ? `Please re-analyze this dataset with the following focus: ${regeneratePrompt}\n\nDataset: ${JSON.stringify(
            dataSummary,
            null,
            2
          )}\n\nFull data:\n${JSON.stringify(data, null, 2)}`
        : `Analyze this dataset and generate a professional report:\n\nDataset: ${JSON.stringify(
            dataSummary,
            null,
            2
          )}\n\nFull data:\n${JSON.stringify(data, null, 2)}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content: userPrompt,
            },
          ],
          system: systemPrompt,
        }),
      });

      const result: ClaudeResponse = await response.json();

      if (result.content && result.content[0]) {
        const reportText = result.content[0].text;
        setReport(reportText);
        setRegeneratePrompt("");
      } else {
        setError("Failed to generate report");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Analysis error: ${errorMessage}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeDataTypes = (
    data: DataRow[],
    headers: string[]
  ): Record<string, string> => {
    const types: Record<string, string> = {};
    headers.forEach((header) => {
      const values = data.map((row) => row[header]).filter((v) => v != null);
      const sample = values[0];

      if (typeof sample === "number") {
        types[header] = "numeric";
      } else if (!isNaN(Date.parse(sample))) {
        types[header] = "date";
      } else {
        types[header] = "text";
      }
    });
    return types;
  };

  const downloadPDF = (): void => {
    const printWindow = window.open("", "", "height=800,width=800");
    if (!printWindow) {
      setError(
        "Unable to open print window. Please check your browser settings."
      );
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Data Analysis Report - ${fileName}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              line-height: 1.6; 
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
            h2 { color: #1e40af; margin-top: 30px; }
            h3 { color: #3b82f6; }
            table { border-collapse: collapse; width: 100%; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #2563eb; color: white; }
            code { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; }
            pre { background: #f1f5f9; padding: 15px; border-radius: 5px; overflow-x: auto; }
          </style>
        </head>
        <body>
          ${marked(report || "")}
        </body>
      </html>
    `);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const marked = (text: string): string => {
    return text
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-xl p-8">
          <div className="flex items-center gap-3 mb-8">
            <FileText className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-800">
              AI Data Analysis Report Generator
            </h1>
          </div>

          {/* File Upload Section */}
          <div className="mb-8">
            <label className="block mb-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium text-gray-700">
                  {fileName || "Click to upload dataset"}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Supports CSV, XLS, and XLSX files
                </p>
              </div>
            </label>
          </div>

          {/* Data Preview */}
          {data && data.length > 0 && (
            <div className="mb-8 p-6 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-4">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                <h2 className="text-xl font-semibold text-gray-800">
                  Dataset Loaded
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-600">Rows</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {data.length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Columns</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {headers.length}
                  </p>
                </div>
              </div>
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Columns:</p>
                <div className="flex flex-wrap gap-2">
                  {headers.map((header, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                    >
                      {header}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => analyzeData(false)}
                disabled={isAnalyzing}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing Data...
                  </>
                ) : (
                  "Generate Report"
                )}
              </button>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Report Display */}
          {report && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <h2 className="text-xl font-semibold text-gray-800">
                    Analysis Complete
                  </h2>
                </div>
                <button
                  onClick={downloadPDF}
                  className="bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export to PDF
                </button>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">
                  {report}
                </pre>
              </div>

              {/* Regeneration Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                  Request Re-analysis
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Not satisfied with the report? Provide specific instructions
                  for re-analysis.
                </p>
                <textarea
                  value={regeneratePrompt}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                    setRegeneratePrompt(e.target.value)
                  }
                  placeholder="E.g., 'Focus more on cost trends' or 'Include product comparison' or 'Provide more actionable recommendations'"
                  className="w-full p-3 border border-gray-300 rounded-lg mb-4 min-h-24 text-sm"
                />
                <button
                  onClick={() => analyzeData(true)}
                  disabled={isAnalyzing || !regeneratePrompt.trim()}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Re-analyzing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5" />
                      Regenerate Report
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Instructions */}
          {!data && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                How it works
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-gray-700">
                <li>Upload your CSV or Excel file containing your data</li>
                <li>
                  The AI will automatically identify the report type needed
                </li>
                <li>Review the comprehensive analysis report</li>
                <li>
                  Download as PDF or request re-analysis with specific focus
                  areas
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
