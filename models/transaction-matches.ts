import { prisma } from "@/lib/db"
import { TransactionMatch, Prisma } from "@/prisma/client"
import { cache } from "react"

export type TransactionMatchData = {
  batchId: string
  transactionId: string
  confidence: number
  matchedAmount: number
  matchedDate: Date
  existingDate: Date
  daysDifference: number
  status?: string
  csvData: Record<string, unknown>
  mergedFields?: string[]
  reviewedBy?: string | null
  reviewedAt?: Date | null
}

/**
 * Create a new transaction match record
 */
export const createTransactionMatch = async (
  data: TransactionMatchData
): Promise<TransactionMatch> => {
  return await prisma.transactionMatch.create({
    data: {
      batchId: data.batchId,
      transactionId: data.transactionId,
      confidence: data.confidence,
      matchedAmount: data.matchedAmount,
      matchedDate: data.matchedDate,
      existingDate: data.existingDate,
      daysDifference: data.daysDifference,
      status: data.status || (data.confidence >= 90 ? "auto_merged" : "flagged"),
      csvData: data.csvData as Prisma.InputJsonValue,
      mergedFields: (data.mergedFields || []) as Prisma.InputJsonValue,
      reviewedBy: data.reviewedBy || null,
      reviewedAt: data.reviewedAt || null,
    },
  })
}

/**
 * Get a transaction match by ID
 */
export const getTransactionMatchById = cache(
  async (id: string): Promise<TransactionMatch | null> => {
    return await prisma.transactionMatch.findUnique({
      where: { id },
      include: {
        transaction: {
          include: {
            category: true,
            project: true,
          },
        },
        batch: true,
      },
    })
  }
)

/**
 * Get all transaction matches for a batch
 */
export const getTransactionMatchesByBatch = cache(
  async (batchId: string, status?: string): Promise<TransactionMatch[]> => {
    return await prisma.transactionMatch.findMany({
      where: {
        batchId,
        ...(status && { status }),
      },
      include: {
        transaction: {
          include: {
            category: true,
            project: true,
          },
        },
      },
      orderBy: { confidence: "desc" },
    })
  }
)

/**
 * Get flagged matches for a batch (requires manual review)
 */
export const getFlaggedMatches = cache(async (batchId: string): Promise<TransactionMatch[]> => {
  return await prisma.transactionMatch.findMany({
    where: {
      batchId,
      status: "flagged",
    },
    include: {
      transaction: {
        include: {
          category: true,
          project: true,
        },
      },
    },
    orderBy: { confidence: "desc" },
  })
})

/**
 * Get auto-merged matches for a batch
 */
export const getAutoMergedMatches = cache(async (batchId: string): Promise<TransactionMatch[]> => {
  return await prisma.transactionMatch.findMany({
    where: {
      batchId,
      status: "auto_merged",
    },
    include: {
      transaction: {
        include: {
          category: true,
          project: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })
})

/**
 * Get all matches for a specific transaction
 */
export const getMatchesForTransaction = cache(
  async (transactionId: string): Promise<TransactionMatch[]> => {
    return await prisma.transactionMatch.findMany({
      where: { transactionId },
      include: {
        batch: true,
      },
      orderBy: { createdAt: "desc" },
    })
  }
)

/**
 * Update a transaction match
 */
export const updateTransactionMatch = async (
  id: string,
  data: Partial<TransactionMatchData>
): Promise<TransactionMatch> => {
  return await prisma.transactionMatch.update({
    where: { id },
    data: {
      ...(data.status && { status: data.status }),
      ...(data.mergedFields && { mergedFields: data.mergedFields as Prisma.InputJsonValue }),
      ...(data.reviewedBy !== undefined && { reviewedBy: data.reviewedBy }),
      ...(data.reviewedAt !== undefined && { reviewedAt: data.reviewedAt }),
    },
  })
}

/**
 * Mark a flagged match as reviewed and merged
 */
export const approveMatch = async (
  id: string,
  userId: string,
  mergedFields?: string[]
): Promise<TransactionMatch> => {
  return await prisma.transactionMatch.update({
    where: { id },
    data: {
      status: "reviewed_merged",
      reviewedBy: userId,
      reviewedAt: new Date(),
      ...(mergedFields && { mergedFields: mergedFields as Prisma.InputJsonValue }),
    },
  })
}

/**
 * Mark a flagged match as rejected (don't merge)
 */
export const rejectMatch = async (id: string, userId: string): Promise<TransactionMatch> => {
  return await prisma.transactionMatch.update({
    where: { id },
    data: {
      status: "reviewed_rejected",
      reviewedBy: userId,
      reviewedAt: new Date(),
    },
  })
}

/**
 * Count matches by status for a batch
 */
export const countMatchesByStatus = cache(
  async (batchId: string): Promise<Record<string, number>> => {
    const counts = await prisma.transactionMatch.groupBy({
      by: ["status"],
      where: { batchId },
      _count: true,
    })

    return counts.reduce(
      (acc, item) => {
        acc[item.status] = item._count
        return acc
      },
      {} as Record<string, number>
    )
  }
)

/**
 * Count flagged matches for a batch
 */
export const countFlaggedMatches = cache(async (batchId: string): Promise<number> => {
  return await prisma.transactionMatch.count({
    where: {
      batchId,
      status: "flagged",
    },
  })
})

/**
 * Delete a transaction match
 */
export const deleteTransactionMatch = async (id: string): Promise<TransactionMatch> => {
  return await prisma.transactionMatch.delete({
    where: { id },
  })
}

/**
 * Delete all transaction matches for a batch
 */
export const deleteTransactionMatchesByBatch = async (
  batchId: string
): Promise<Prisma.BatchPayload> => {
  return await prisma.transactionMatch.deleteMany({
    where: { batchId },
  })
}
