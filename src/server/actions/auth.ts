"use server"

import { invalidateSession, setSession, validateRequest } from "@/lib/auth"
import { AUTHORIZED_URL, UNAUTHORIZED_URL } from "@/lib/consts"
import {
  createPassword,
  createUser,
  findUserByEmail,
  verifyPassword,
} from "@/server/data"
import { getIpAddress } from "@/utils/headers"
import { SignInSchema, SignUpSchema } from "@/utils/validation"
import { parseWithZod } from "@conform-to/zod"
import { redirect } from "next/navigation"

export async function signUp(prevState: unknown, formData: FormData) {
  const submission = parseWithZod(formData, {
    schema: SignUpSchema,
  })

  if (submission.status !== "success") {
    return submission.reply()
  }

  const existingUser = await findUserByEmail(submission.value.email)

  if (existingUser) {
    return submission.reply({
      formErrors: ["There's already an account with this email"],
    })
  }

  const newUser = await createUser({
    email: submission.value.email,
  })

  await createPassword(newUser.id, submission.value.password)

  const ipAddress = getIpAddress()

  await setSession(newUser.id, { ipAddress })

  redirect(AUTHORIZED_URL)
}

export async function signInWithPassword(_: unknown, formData: FormData) {
  const submission = parseWithZod(formData, {
    schema: SignInSchema,
  })

  if (submission.status !== "success") {
    return submission.reply()
  }

  const existingUser = await findUserByEmail(submission.value.email)

  if (!existingUser) {
    return submission.reply({
      formErrors: ["Incorrect email or password"],
    })
  }

  const isValidPassword = await verifyPassword(
    existingUser.id,
    submission.value.password,
  )

  if (!isValidPassword) {
    return submission.reply({
      formErrors: ["Incorrect email or password"],
    })
  }

  const ipAddress = getIpAddress()

  await setSession(existingUser.id, { ipAddress })

  redirect(AUTHORIZED_URL)
}

export async function signOut() {
  const { session } = await validateRequest()

  if (!session) {
    return redirect(UNAUTHORIZED_URL)
  }

  await invalidateSession(session)

  redirect(UNAUTHORIZED_URL)
}