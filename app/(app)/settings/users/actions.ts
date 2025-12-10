"use server"

import { ACTING_AS_COOKIE, getAdminUser } from "@/lib/auth"
import { createUserProfile, deleteUserProfile, setUserAdmin, updateUser } from "@/models/users"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

export type ActionState<T = null> = {
  success: boolean
  error?: string
  data?: T
} | null

/**
 * Switch to acting as a different user
 */
export async function switchUserAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  try {
    const userId = formData.get("userId") as string

    if (!userId) {
      return { success: false, error: "No user ID provided" }
    }

    const cookieStore = await cookies()

    if (userId === "clear") {
      // Clear the acting-as cookie to return to admin
      cookieStore.delete(ACTING_AS_COOKIE)
    } else {
      // Set the acting-as cookie
      cookieStore.set(ACTING_AS_COOKIE, userId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: "/",
      })
    }

    revalidatePath("/")
    return { success: true }
  } catch (error) {
    console.error("Error switching user:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to switch user",
    }
  }
}

/**
 * Create a new user profile
 */
export async function createUserAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  try {
    const admin = await getAdminUser()
    if (!admin?.isAdmin) {
      return { success: false, error: "Only admins can create users" }
    }

    const name = formData.get("name") as string
    const email = formData.get("email") as string | null
    const isAdmin = formData.get("isAdmin") === "true"

    if (!name || name.trim().length === 0) {
      return { success: false, error: "Name is required" }
    }

    await createUserProfile({
      name: name.trim(),
      email: email?.trim() || undefined,
      isAdmin,
    })

    revalidatePath("/settings/users")
    return { success: true }
  } catch (error) {
    console.error("Error creating user:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create user",
    }
  }
}

/**
 * Update a user profile
 */
export async function updateUserAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  try {
    const admin = await getAdminUser()
    if (!admin?.isAdmin) {
      return { success: false, error: "Only admins can update users" }
    }

    const userId = formData.get("userId") as string
    const name = formData.get("name") as string

    if (!userId || !name) {
      return { success: false, error: "User ID and name are required" }
    }

    await updateUser(userId, { name: name.trim() })

    revalidatePath("/settings/users")
    return { success: true }
  } catch (error) {
    console.error("Error updating user:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update user",
    }
  }
}

/**
 * Delete a user profile
 */
export async function deleteUserAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  try {
    const admin = await getAdminUser()
    if (!admin?.isAdmin) {
      return { success: false, error: "Only admins can delete users" }
    }

    const userId = formData.get("userId") as string

    if (!userId) {
      return { success: false, error: "User ID is required" }
    }

    // Clear the acting-as cookie if deleting the current user
    const cookieStore = await cookies()
    const actingAsUserId = cookieStore.get(ACTING_AS_COOKIE)?.value
    if (actingAsUserId === userId) {
      cookieStore.delete(ACTING_AS_COOKIE)
    }

    await deleteUserProfile(userId)

    revalidatePath("/settings/users")
    return { success: true }
  } catch (error) {
    console.error("Error deleting user:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete user",
    }
  }
}

/**
 * Toggle user admin status
 */
export async function toggleAdminAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  try {
    const admin = await getAdminUser()
    if (!admin?.isAdmin) {
      return { success: false, error: "Only admins can change admin status" }
    }

    const userId = formData.get("userId") as string
    const isAdmin = formData.get("isAdmin") === "true"

    if (!userId) {
      return { success: false, error: "User ID is required" }
    }

    await setUserAdmin(userId, isAdmin)

    revalidatePath("/settings/users")
    return { success: true }
  } catch (error) {
    console.error("Error toggling admin:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update admin status",
    }
  }
}
