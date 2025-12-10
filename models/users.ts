import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"
import { cache } from "react"
import { isDatabaseEmpty } from "./defaults"
import { createUserDefaults } from "./defaults"

export const SELF_HOSTED_USER = {
  email: "taxhacker@localhost",
  name: "Self-Hosted Mode",
  membershipPlan: "unlimited",
}

export const getSelfHostedUser = cache(async () => {
  if (!process.env.DATABASE_URL) {
    return null // fix for CI, do not remove
  }

  return await prisma.user.findFirst({
    where: { email: SELF_HOSTED_USER.email },
  })
})

export const getOrCreateSelfHostedUser = cache(async () => {
  return await prisma.user.upsert({
    where: { email: SELF_HOSTED_USER.email },
    update: SELF_HOSTED_USER,
    create: SELF_HOSTED_USER,
  })
})

export async function getOrCreateCloudUser(email: string, data: Prisma.UserCreateInput) {
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: data,
    create: data,
  })

  if (await isDatabaseEmpty(user.id)) {
    await createUserDefaults(user.id)
  }
  
  return user
}

export const getUserById = cache(async (id: string) => {
  return await prisma.user.findUnique({
    where: { id },
  })
})

export const getUserByEmail = cache(async (email: string) => {
  return await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  })
})

export const getUserByStripeCustomerId = cache(async (customerId: string) => {
  return await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  })
})

export function updateUser(userId: string, data: Prisma.UserUpdateInput) {
  return prisma.user.update({
    where: { id: userId },
    data,
  })
}

/**
 * Get all users (for user management in self-hosted mode)
 */
export const getAllUsers = cache(async () => {
  return await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      isAdmin: true,
      createdAt: true,
    },
  })
})

/**
 * Create a new user profile (for self-hosted mode)
 */
export async function createUserProfile(data: { name: string; email?: string; isAdmin?: boolean }) {
  const email = data.email || `${data.name.toLowerCase().replace(/\s+/g, '.')}@local`
  return await prisma.user.create({
    data: {
      name: data.name,
      email,
      isAdmin: data.isAdmin || false,
      membershipPlan: 'unlimited',
    },
  })
}

/**
 * Delete a user profile (cannot delete admin users)
 */
export async function deleteUserProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new Error('User not found')
  }
  if (user.isAdmin) {
    throw new Error('Cannot delete admin user')
  }
  return await prisma.user.delete({ where: { id: userId } })
}

/**
 * Update user admin status
 */
export async function setUserAdmin(userId: string, isAdmin: boolean) {
  return await prisma.user.update({
    where: { id: userId },
    data: { isAdmin },
  })
}
