"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Plus, Shield, Trash2, User } from "lucide-react"
import { useActionState, useState } from "react"
import { createUserAction, deleteUserAction, switchUserAction } from "./actions"

type UserProfile = {
  id: string
  name: string
  email: string
  avatar: string | null
  isAdmin: boolean
  createdAt: Date
}

export function UserManagement({
  users,
  currentUserId,
  isAdmin,
}: {
  users: UserProfile[]
  currentUserId: string
  isAdmin: boolean
}) {
  const [switchState, switchAction] = useActionState(switchUserAction, null)
  const [createState, createAction] = useActionState(createUserAction, null)
  const [deleteState, deleteAction] = useActionState(deleteUserAction, null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newUserName, setNewUserName] = useState("")

  return (
    <div className="space-y-4">
      {/* Current User Indicator */}
      <div className="rounded-lg border bg-muted/50 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>Currently acting as:</span>
          <span className="font-medium text-foreground">
            {users.find((u) => u.id === currentUserId)?.name || "Unknown"}
          </span>
        </div>
      </div>

      {/* User List */}
      <div className="space-y-2">
        {users.map((user) => (
          <Card
            key={user.id}
            className={`${user.id === currentUserId ? "ring-2 ring-primary" : ""}`}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.avatar || undefined} alt={user.name} />
                  <AvatarFallback>
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{user.name}</span>
                    {user.isAdmin && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        <Shield className="h-3 w-3" />
                        Admin
                      </span>
                    )}
                    {user.id === currentUserId && (
                      <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600">
                        <Check className="h-3 w-3" />
                        Active
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">{user.email}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {user.id !== currentUserId && (
                  <form action={switchAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Switch to
                    </Button>
                  </form>
                )}
                {isAdmin && !user.isAdmin && (
                  <form action={deleteAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add User Button */}
      {isAdmin && (
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form
              action={createAction}
              onSubmit={() => {
                setIsCreateOpen(false)
                setNewUserName("")
              }}
            >
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>
                  Create a new user profile for audit tracking.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Enter user name"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create User</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Error Messages */}
      {switchState?.error && (
        <p className="text-sm text-destructive">{switchState.error}</p>
      )}
      {createState?.error && (
        <p className="text-sm text-destructive">{createState.error}</p>
      )}
      {deleteState?.error && (
        <p className="text-sm text-destructive">{deleteState.error}</p>
      )}
    </div>
  )
}
