import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getCurrentUser } from "@/lib/auth"
import { getImportBatchById } from "@/models/import-batches"
import { getTransactionMatchesByBatch, countFlaggedMatches } from "@/models/transaction-matches"
import { getImportRowsByBatch } from "@/models/import-rows"
import { CheckCircle2, Flag, PlusCircle, XCircle, ArrowLeft, FileEdit, AlertCircle } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { formatDate } from "date-fns"
import { formatCurrency } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Import Batch Details",
  description: "View detailed import batch results",
}

export default async function ImportBatchDetailsPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const { batchId } = await params
  const user = await getCurrentUser()

  const batch = await getImportBatchById(batchId, user.id)
  if (!batch) {
    notFound()
  }

  const allMatches = await getTransactionMatchesByBatch(batchId)
  const autoMergedMatches = allMatches.filter((m) => m.status === "auto_merged")
  const flaggedMatches = allMatches.filter((m) => m.status === "flagged")
  const reviewedMergedMatches = allMatches.filter((m) => m.status === "reviewed_merged")
  const reviewedRejectedMatches = allMatches.filter((m) => m.status === "reviewed_rejected")

  const importRows = await getImportRowsByBatch(batchId)
  const createdRows = importRows.filter((r) => r.status === "created")
  const errorRows = importRows.filter((r) => r.status === "error")
  const skippedRows = importRows.filter((r) => r.status === "skipped")

  const flaggedCount = await countFlaggedMatches(batchId)

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <div className="flex flex-col gap-2">
          <Link href="/import/history">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back to History
            </Button>
          </Link>
          <h2 className="text-3xl font-bold tracking-tight">{batch.filename}</h2>
          <p className="text-sm text-muted-foreground">
            Imported on {batch.createdAt ? formatDate(batch.createdAt, "PPpp") : "-"}
          </p>
        </div>
        <div className="flex gap-2">
          {flaggedCount > 0 && (
            <Link href={`/import/history/${batchId}/review`}>
              <Button>
                <FileEdit />
                Review {flaggedCount} Flagged Match{flaggedCount > 1 ? "es" : ""}
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="bg-gradient-to-br from-white via-green-50/30 to-emerald-50/40 border-green-200/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auto-Merged</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{batch.matchedCount}</div>
            <p className="text-xs text-muted-foreground">High confidence matches</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/40 border-blue-200/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created New</CardTitle>
            <PlusCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{batch.createdCount}</div>
            <p className="text-xs text-muted-foreground">New transactions</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40 border-yellow-200/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged</CardTitle>
            <Flag className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{batch.skippedCount}</div>
            <p className="text-xs text-muted-foreground">Needs review</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white via-red-50/30 to-rose-50/40 border-red-200/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{batch.errorCount}</div>
            <p className="text-xs text-muted-foreground">Failed to process</p>
          </CardContent>
        </Card>
      </div>

      {/* Auto-Merged Matches */}
      {autoMergedMatches.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Auto-Merged Transactions ({autoMergedMatches.length})
            </CardTitle>
            <CardDescription>High confidence matches that were automatically merged</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>CSV Date</TableHead>
                    <TableHead>DB Date</TableHead>
                    <TableHead>Days Diff</TableHead>
                    <TableHead>Merged Fields</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {autoMergedMatches.map((match) => (
                    <TableRow key={match.id}>
                      <TableCell>
                        <Badge className="bg-green-600">{match.confidence}%</Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/transactions/${match.transactionId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {match.transaction.name || match.transaction.description || "View Transaction"}
                        </Link>
                      </TableCell>
                      <TableCell>{formatCurrency(match.matchedAmount, match.transaction.currencyCode)}</TableCell>
                      <TableCell>{formatDate(match.matchedDate, "yyyy-MM-dd")}</TableCell>
                      <TableCell>{formatDate(match.existingDate, "yyyy-MM-dd")}</TableCell>
                      <TableCell className="text-center">{match.daysDifference}</TableCell>
                      <TableCell>
                        {Array.isArray(match.mergedFields) && match.mergedFields.length > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {(match.mergedFields as string[]).join(", ")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reviewed & Merged */}
      {reviewedMergedMatches.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              Reviewed & Merged ({reviewedMergedMatches.length})
            </CardTitle>
            <CardDescription>Matches that were manually reviewed and approved</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>CSV Date</TableHead>
                    <TableHead>DB Date</TableHead>
                    <TableHead>Days Diff</TableHead>
                    <TableHead>Reviewed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewedMergedMatches.map((match) => (
                    <TableRow key={match.id}>
                      <TableCell>
                        <Badge className="bg-blue-600">{match.confidence}%</Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/transactions/${match.transactionId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {match.transaction.name || match.transaction.description || "View Transaction"}
                        </Link>
                      </TableCell>
                      <TableCell>{formatCurrency(match.matchedAmount, match.transaction.currencyCode)}</TableCell>
                      <TableCell>{formatDate(match.matchedDate, "yyyy-MM-dd")}</TableCell>
                      <TableCell>{formatDate(match.existingDate, "yyyy-MM-dd")}</TableCell>
                      <TableCell className="text-center">{match.daysDifference}</TableCell>
                      <TableCell>
                        {match.reviewedAt ? formatDate(match.reviewedAt, "yyyy-MM-dd HH:mm") : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flagged Matches */}
      {flaggedMatches.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-yellow-600" />
              Flagged for Review ({flaggedMatches.length})
            </CardTitle>
            <CardDescription>
              Lower confidence matches that need manual review
              <Link href={`/import/history/${batchId}/review`} className="ml-2">
                <Button variant="outline" size="sm">
                  <FileEdit className="h-4 w-4" />
                  Review Now
                </Button>
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>CSV Date</TableHead>
                    <TableHead>DB Date</TableHead>
                    <TableHead>Days Diff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flaggedMatches.map((match) => (
                    <TableRow key={match.id}>
                      <TableCell>
                        <Badge className="bg-yellow-600">{match.confidence}%</Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/transactions/${match.transactionId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {match.transaction.name || match.transaction.description || "View Transaction"}
                        </Link>
                      </TableCell>
                      <TableCell>{formatCurrency(match.matchedAmount, match.transaction.currencyCode)}</TableCell>
                      <TableCell>{formatDate(match.matchedDate, "yyyy-MM-dd")}</TableCell>
                      <TableCell>{formatDate(match.existingDate, "yyyy-MM-dd")}</TableCell>
                      <TableCell className="text-center">{match.daysDifference}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rejected Matches */}
      {reviewedRejectedMatches.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-gray-600" />
              Reviewed & Rejected ({reviewedRejectedMatches.length})
            </CardTitle>
            <CardDescription>Matches that were manually reviewed and rejected</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>CSV Date</TableHead>
                    <TableHead>DB Date</TableHead>
                    <TableHead>Days Diff</TableHead>
                    <TableHead>Reviewed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewedRejectedMatches.map((match) => (
                    <TableRow key={match.id}>
                      <TableCell>
                        <Badge className="bg-gray-600">{match.confidence}%</Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/transactions/${match.transactionId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {match.transaction.name || match.transaction.description || "View Transaction"}
                        </Link>
                      </TableCell>
                      <TableCell>{formatCurrency(match.matchedAmount, match.transaction.currencyCode)}</TableCell>
                      <TableCell>{formatDate(match.matchedDate, "yyyy-MM-dd")}</TableCell>
                      <TableCell>{formatDate(match.existingDate, "yyyy-MM-dd")}</TableCell>
                      <TableCell className="text-center">{match.daysDifference}</TableCell>
                      <TableCell>
                        {match.reviewedAt ? formatDate(match.reviewedAt, "yyyy-MM-dd HH:mm") : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Created Transactions */}
      {createdRows.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-blue-600" />
              Created Transactions ({createdRows.length})
            </CardTitle>
            <CardDescription>New transactions created from CSV rows with no matches</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row #</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {createdRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>
                        {row.transactionId ? (
                          <Link href={`/transactions/${row.transactionId}`} className="text-blue-600 hover:underline">
                            View Transaction
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Not linked</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-blue-600">Created</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Errors */}
      {errorRows.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Errors ({errorRows.length})
            </CardTitle>
            <CardDescription>Rows that failed to process</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row #</TableHead>
                    <TableHead>Error Message</TableHead>
                    <TableHead>Raw Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errorRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell className="text-red-600">
                        <span className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          {row.errorMessage || "Unknown error"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">View raw data</summary>
                          <pre className="text-xs mt-2 p-2 bg-gray-100 rounded">
                            {JSON.stringify(row.rawData, null, 2)}
                          </pre>
                        </details>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Skipped Rows */}
      {skippedRows.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-gray-600" />
              Skipped Rows ({skippedRows.length})
            </CardTitle>
            <CardDescription>Rows that were skipped during processing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row #</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skippedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.errorMessage || "Already matched in this batch"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
