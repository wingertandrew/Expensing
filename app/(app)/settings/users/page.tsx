import { getAdminUser, getCurrentUser } from "@/lib/auth"
import { getAllUsers } from "@/models/users"
import { UserManagement } from "./user-management"

export default async function UsersSettingsPage() {
  const currentUser = await getCurrentUser()
  const adminUser = await getAdminUser()
  const users = await getAllUsers()

  const isAdmin = adminUser?.isAdmin || false

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-lg font-medium">User Management</h3>
        <p className="text-sm text-muted-foreground">
          Manage user profiles for audit tracking. Select a user to act as them.
        </p>
      </div>

      <UserManagement
        users={users}
        currentUserId={currentUser.id}
        isAdmin={isAdmin}
      />
    </div>
  )
}
